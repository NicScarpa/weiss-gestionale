import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  TEMPLATE_DB,
  adminDatabaseUrl,
  allWorkerDbNames,
  childEnv,
  databaseUrl,
  PG_SERVER,
} from './env-guard'
import { createSeedBackupSql } from './seed-tables'

const run = promisify(execFile)

/** Radice del progetto: il cwd di chi lancia la suite non è affidabile. */
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * Prepara i database dei test di integrazione, una volta per esecuzione della
 * suite.
 *
 * Lo schema e il seed costano qualche secondo: pagarli una volta sola su un
 * database *template* e poi clonarlo con `CREATE DATABASE ... TEMPLATE` rende
 * la preparazione di ogni worker quasi istantanea (PostgreSQL copia i file).
 *
 * Non si usa mai `prisma db push --force-reset`: quel comando distrugge il
 * database a cui punta `DATABASE_URL`, e basterebbe un ambiente sbagliato per
 * cancellare la produzione. Qui i database vengono creati e distrutti per nome,
 * e i nomi passano tutti dal guard.
 */
async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminDatabaseUrl() })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(
      `Impossibile connettersi a PostgreSQL su ${PG_SERVER}. ` +
        'I test di integrazione richiedono un server locale attivo.\n' +
        `Dettaglio: ${(error as Error).message}`
    )
  }
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * Ricrea un database da zero. `WITH (FORCE)` chiude le connessioni residue di
 * esecuzioni precedenti, che altrimenti farebbero fallire il DROP.
 */
async function recreateDatabase(
  client: Client,
  name: string,
  template?: string
): Promise<void> {
  const quoted = client.escapeIdentifier(name)
  await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`)
  const from = template ? ` TEMPLATE ${client.escapeIdentifier(template)}` : ''
  await client.query(`CREATE DATABASE ${quoted}${from}`)
}

async function applySchema(): Promise<void> {
  // Solo opzioni che questa versione della CLI riconosce davvero: `db push` di
  // Prisma 7, davanti a un'opzione sconosciuta (`--skip-generate`, per dirne
  // una che non esiste più), stampa l'help invece di toccare il database. Per
  // questo il risultato viene verificato da `assertSchemaApplied`.
  //
  // L'URL si passa anche esplicitamente, non solo nell'ambiente: `--url` ha la
  // precedenza su `prisma.config.ts`, quindi nemmeno un `.env` dimenticato può
  // dirottare il push su un altro database.
  await run('npx', ['prisma', 'db', 'push', '--url', databaseUrl(TEMPLATE_DB)], {
    cwd: projectRoot,
    env: childEnv(TEMPLATE_DB),
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function applySeed(): Promise<void> {
  await run('npx', ['tsx', 'prisma/seed.ts'], {
    cwd: projectRoot,
    env: childEnv(TEMPLATE_DB),
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function withTemplateClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl(TEMPLATE_DB) })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * Numero minimo di tabelle che lo schema deve produrre. Al momento ne crea 78:
 * la soglia è tenuta bassa perché lo schema cresce, ma un push a vuoto (zero
 * tabelle) deve essere impossibile da confondere con un successo.
 */
const MIN_TABLES = 50

/**
 * Verifica che lo schema sia davvero atterrato sul template.
 *
 * Un comando che esce con codice zero non dimostra di aver fatto qualcosa: una
 * CLI che non riconosce un'opzione può limitarsi a stampare l'help e uscire
 * pulita, lasciando il database vuoto. Senza questo controllo la suite
 * fallirebbe molto più tardi, con errori che sembrano bug del codice sotto test
 * invece che un ambiente non preparato.
 */
async function assertSchemaApplied(): Promise<void> {
  const tableCount = await withTemplateClient(async (client) => {
    const result = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'"
    )
    return Number(result.rows[0]?.n ?? 0)
  })

  if (tableCount < MIN_TABLES) {
    throw new Error(
      `Schema non applicato: il database "${TEMPLATE_DB}" ha ${tableCount} tabelle ` +
        `invece delle almeno ${MIN_TABLES} attese. "prisma db push" è uscito senza ` +
        'errore ma non ha creato nulla: controlla il comando in applySchema(), ' +
        "un'opzione non riconosciuta fa stampare l'help alla CLI."
    )
  }
}

/**
 * Vincoli che Prisma non sa esprimere (indici unici parziali). Sono la rete che
 * impedisce i duplicati contabili, e senza di loro i test sulla concorrenza
 * darebbero verdetti falsi: fallirebbero pur essendo corretto il codice, perché
 * il vincolo che dovrebbe mordere non esisterebbe nel database di prova.
 *
 * Il file appartiene a F3: qui viene solo eseguito, mai modificato.
 */
const CONSTRAINTS_SQL = fileURLToPath(
  new URL('../../../prisma/migrations/post-push/constraints.sql', import.meta.url)
)

/**
 * Toglie i meta-comandi di psql (le righe che cominciano per barra rovesciata,
 * come `\set ON_ERROR_STOP on`): sono istruzioni per il client psql, non SQL, e
 * il driver `pg` le rifiuterebbe con un errore di sintassi. Il file resta la
 * fonte di verità, cambia solo il client che lo esegue — `pg` invece di `psql`,
 * che può non essere nel PATH di chi lancia i test.
 *
 * L'`ON_ERROR_STOP` che si perde per strada non manca: il driver esegue l'intero
 * script in un'unica transazione implicita, quindi al primo errore non resta
 * applicato niente, che è più sicuro del fermarsi a metà.
 */
function stripPsqlMetaCommands(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n')
}

/** Indici dichiarati nel file: l'atteso si legge da lì, non da una copia locale. */
function declaredIndexNames(sql: string): string[] {
  const pattern = /CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi
  return [...sql.matchAll(pattern)].map((match) => match[1])
}

async function applyConstraints(): Promise<string[]> {
  const sql = await readFile(CONSTRAINTS_SQL, 'utf8')

  await withTemplateClient(async (client) => {
    await client.query(stripPsqlMetaCommands(sql))
  })

  return declaredIndexNames(sql)
}

/**
 * Verifica che i vincoli siano davvero nel database. Gli indici attesi si
 * ricavano dal file stesso, così se ne vengono aggiunti o tolti qui non c'è
 * nulla da tenere allineato.
 */
async function assertConstraintsApplied(expected: string[]): Promise<void> {
  const { present, partialUnique } = await withTemplateClient(async (client) => {
    const found = await client.query<{ indexname: string }>(
      'SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = ANY($2)',
      ['public', expected]
    )
    const partial = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_indexes WHERE schemaname = 'public' " +
        "AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%WHERE%'"
    )
    return {
      present: found.rows.map((row) => row.indexname),
      partialUnique: Number(partial.rows[0]?.n ?? 0),
    }
  })

  const missing = expected.filter((name) => !present.includes(name))

  if (missing.length > 0) {
    throw new Error(
      `Vincoli di unicità non applicati al database "${TEMPLATE_DB}": mancano ` +
        `${missing.join(', ')}. Nel database risultano ${partialUnique} indici unici ` +
        'parziali. Senza questi vincoli i test sui duplicati contabili darebbero un ' +
        "verdetto sull'ambiente invece che sul codice: controlla applyConstraints() e " +
        'prisma/migrations/post-push/constraints.sql.'
    )
  }
}

/** Verifica che il seed abbia creato le anagrafiche su cui poggiano i test. */
async function assertSeedApplied(): Promise<void> {
  const counts = await withTemplateClient(async (client) => {
    const result = await client.query<{ users: string; venues: string; roles: string }>(
      'SELECT (SELECT count(*) FROM users)::text AS users, ' +
        '(SELECT count(*) FROM venues)::text AS venues, ' +
        '(SELECT count(*) FROM roles)::text AS roles'
    )
    return result.rows[0]
  })

  if (
    Number(counts.users) === 0 ||
    Number(counts.venues) === 0 ||
    Number(counts.roles) === 0
  ) {
    throw new Error(
      `Seed incompleto sul database "${TEMPLATE_DB}": ${counts.users} utenti, ` +
        `${counts.venues} sedi, ${counts.roles} ruoli. Senza anagrafiche loginAs() ` +
        'non può funzionare. Verifica che ENCRYPTION_KEY sia una chiave di 32 byte ' +
        'codificata in base64: il seed cifra i campi sensibili e con una chiave di ' +
        'lunghezza diversa fallisce.'
    )
  }
}

/**
 * Congela il contenuto del seed in uno schema a parte del template. I cloni lo
 * ereditano, e il reset fra i test lo usa per rimettere in piedi le anagrafiche
 * dopo aver svuotato il database.
 */
async function backupSeed(): Promise<void> {
  await withTemplateClient(async (client) => {
    for (const statement of createSeedBackupSql()) {
      await client.query(statement)
    }
  })
}

export async function setup(): Promise<void> {
  const started = Date.now()

  await withAdminClient((client) => recreateDatabase(client, TEMPLATE_DB))

  // Ogni passo viene verificato subito dopo: così il messaggio d'errore indica
  // il comando che non ha funzionato, invece di lasciare il guasto affiorare
  // dentro un test qualsiasi mezz'ora dopo.
  await applySchema()
  await assertSchemaApplied()

  // I vincoli si applicano prima del seed, non dopo: così il seed gira già
  // sotto le stesse regole della produzione, e se un giorno cominciasse a
  // creare due fornitori con la stessa partita IVA lo si scoprirebbe qui.
  const constraints = await applyConstraints()
  await assertConstraintsApplied(constraints)

  await applySeed()
  await assertSeedApplied()

  await backupSeed()

  // I cloni si creano dopo aver chiuso ogni connessione al template: PostgreSQL
  // rifiuta di usare come modello un database con sessioni aperte.
  await withAdminClient(async (client) => {
    for (const name of allWorkerDbNames()) {
      await recreateDatabase(client, name, TEMPLATE_DB)
    }
  })

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `[itest] ${allWorkerDbNames().length} database pronti su ${PG_SERVER} in ${seconds}s`
  )
}
