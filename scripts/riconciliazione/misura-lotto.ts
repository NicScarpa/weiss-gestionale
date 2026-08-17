/**
 * Misura il motore di riconciliazione (`generaLotto`) su un database di prova
 * caricato con i movimenti bancari veri degli snapshot GoCardless.
 *
 * Il primo script (`misura-motore.ts`) misura le **causali**, offline. Questo
 * misura il **motore**: carica i movimenti veri come righe `BankTransaction`,
 * costruisce un insieme di scadenze **sintetiche** dall'altro lato, esegue
 * `generaLotto` e riporta quante proposte escono, come si distribuiscono per
 * fascia, quanto ci mette, e — il punto che una revisione ha lasciato aperto —
 * quante operazioni finiscono nella singola transazione che le persiste.
 *
 * ## Cosa questo script misura, e cosa no
 *
 * **Misura**: che il motore gira su volumi veri, quanto ci mette, e quanto
 * diventa grossa la transazione. Sono fatti meccanici, e bastano a chiudere la
 * riserva sulla scala.
 *
 * **Non misura**: se le proposte sono **giuste**. Le scadenze sono sintetiche
 * (vedi `costruisciScadenzeSintetiche` sotto), quindi il tasso di correttezza
 * che ne uscirebbe sarebbe una tautologia — il motore ritroverebbe ciò che lo
 * script ha appena costruito.
 *
 * Il criterio della spec — «la fascia Alta dev'essere corretta quasi al 100%
 * su un campione controllato a mano» — non è raggiungibile in questa fase:
 * richiede i due lati veri insieme, i movimenti della banca e le fatture che
 * pagano. In questo repository ci sono solo i movimenti; le fatture vere stanno
 * nel database di produzione, non come file. Quella misura diventa possibile
 * dopo la Fase 3 dell'open banking, quando i movimenti sincronizzati si
 * troveranno accanto alle fatture già importate.
 *
 * ## Il database
 *
 * Questo script crea, usa e distrugge un database PostgreSQL locale dedicato,
 * il cui nome dipende **per intero** da `TEST_DB_SUFFIX`: niente valore di
 * default, perché senza un suffisso esplicito il nome coinciderebbe con quello
 * di una suite di test in esecuzione in un'altra copia di lavoro del
 * repository (ne condividono tutte lo stesso PostgreSQL locale), e questo
 * script lo DROPpa a fine corsa.
 *
 * Uso:
 *   TEST_DB_SUFFIX=ric_a1 npx tsx scripts/riconciliazione/misura-lotto.ts
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  adminDatabaseUrl,
  applyTestEnv,
  childEnv,
  databaseUrl,
  workerDbName,
  PG_SERVER,
} from '../../src/test/integration/env-guard'
import { estraiRiferimentiDocumento } from '../../src/lib/reconciliation/causale'
import { leggiMovimenti, causaleDi, type MovimentoSnapshot } from './snapshot'

const run = promisify(execFile)
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Il codice operazione dei bonifici veri e propri (24,5% delle uscite nella misurazione offline). */
const CODICE_BONIFICO = '26//11'
/** Quanti giorni dopo la scadenza sintetica si finge sia arrivato il pagamento. */
const RITARDO_SINTETICO_GIORNI = 5
/** Soglia minima di tabelle che `prisma db push` deve creare, come nel global setup dei test. */
const MIN_TABLES = 50

const MILLISECONDI_GIORNO = 86_400_000

function richiedeSuffisso(): string {
  const suffisso = process.env.TEST_DB_SUFFIX
  if (!suffisso) {
    console.error(
      'TEST_DB_SUFFIX non impostato.\n' +
        'Questo script crea e poi DROPpa un database PostgreSQL locale: senza un ' +
        'suffisso esplicito il nome coinciderebbe con quello di una suite vitest in ' +
        "esecuzione in un'altra copia di lavoro del repository, che condivide lo " +
        'stesso PostgreSQL locale.\n\n' +
        'Uso: TEST_DB_SUFFIX=ric_a1 npx tsx scripts/riconciliazione/misura-lotto.ts'
    )
    process.exit(1)
  }
  return suffisso
}

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminDatabaseUrl() })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(
      `Impossibile connettersi a PostgreSQL su ${PG_SERVER}. ` +
        `Dettaglio: ${(error as Error).message}`
    )
  }
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** `WITH (FORCE)` chiude le connessioni residue di esecuzioni precedenti interrotte. */
async function ricreaDatabase(client: Client, name: string): Promise<void> {
  const quoted = client.escapeIdentifier(name)
  await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`)
  await client.query(`CREATE DATABASE ${quoted}`)
}

async function eliminaDatabase(client: Client, name: string): Promise<void> {
  const quoted = client.escapeIdentifier(name)
  await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`)
}

async function applicaSchema(dbName: string): Promise<void> {
  await run('npx', ['prisma', 'db', 'push', '--url', databaseUrl(dbName)], {
    cwd: projectRoot,
    env: childEnv(dbName),
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function verificaSchemaApplicato(dbName: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl(dbName) })
  await client.connect()
  try {
    const result = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'"
    )
    const tableCount = Number(result.rows[0]?.n ?? 0)
    if (tableCount < MIN_TABLES) {
      throw new Error(
        `Schema non applicato: il database "${dbName}" ha ${tableCount} tabelle ` +
          `invece delle almeno ${MIN_TABLES} attese.`
      )
    }
  } finally {
    await client.end()
  }
}

interface MovimentoValido {
  snapshot: MovimentoSnapshot
  data: Date
  importo: number
  causale: string
}

/** Solo i movimenti con i campi che servono davvero a costruire una riga. */
function movimentiValidi(): MovimentoValido[] {
  const validi: MovimentoValido[] = []
  for (const snapshot of leggiMovimenti()) {
    const importoTesto = snapshot.transactionAmount?.amount
    if (!snapshot.bookingDate || importoTesto === undefined) continue
    const data = new Date(snapshot.bookingDate)
    const importo = Number(importoTesto)
    if (Number.isNaN(data.getTime()) || Number.isNaN(importo)) continue
    validi.push({ snapshot, data, importo, causale: causaleDi(snapshot) })
  }
  return validi
}

interface ScadenzaSintetica {
  descrizione: string
  importoTotale: number
  dataScadenza: Date
  numeroDocumento: string | null
}

/**
 * Le scadenze sintetiche, dall'altro lato del pagamento che qui non abbiamo.
 *
 * **La regola, dichiarata per intero**: una scadenza passiva per ogni uscita
 * col codice operazione `26//11` (bonifico tramite internet banking) — il
 * codice che nella misurazione offline (`misura-motore.ts`) risulta associato
 * a un riferimento leggibile nel 36% dei casi, cioè quello dei movimenti che
 * *assomigliano* a un pagamento fornitore, a differenza delle commissioni o
 * degli emolumenti. Importo identico al movimento, data di scadenza spostata
 * indietro di 5 giorni (si finge un pagamento in lieve ritardo, il caso più
 * comune), numero documento estratto dalla causale quando c'è.
 *
 * Deliberatamente **non** si imposta `controparteNome`: non abbiamo un nome
 * vero da mettere lì, e inventarne uno ricavato dalla causale stessa
 * garantirebbe un match per costruzione — lo stesso problema di tautologia che
 * questo file dichiara altrove, spostato dall'importo al nome. La conseguenza,
 * dichiarata nel README, è che il fattore CONTROPARTE (20 punti) e il fattore
 * CODICE_BANCA (10 punti, la mappa è vuota per le stesse ragioni viste in
 * `generaLotto`) restano a zero per costruzione: la fascia Alta (soglia 85) è
 * strutturalmente irraggiungibile da questi dati sintetici, non solo per la
 * tautologia sulla correttezza.
 */
function costruisciScadenzeSintetiche(movimenti: MovimentoValido[]): ScadenzaSintetica[] {
  return movimenti
    .filter((m) => m.importo < 0 && m.snapshot.proprietaryBankTransactionCode === CODICE_BONIFICO)
    .map((m) => {
      const riferimenti = estraiRiferimentiDocumento(m.causale)
      return {
        descrizione: `Scadenza sintetica per movimento ${m.snapshot.transactionId ?? '?'}`,
        importoTotale: Math.abs(m.importo),
        dataScadenza: new Date(m.data.getTime() - RITARDO_SINTETICO_GIORNI * MILLISECONDI_GIORNO),
        numeroDocumento: riferimenti[0] ?? null,
      }
    })
}

/**
 * `@prisma/adapter-pg`, quando riceve un `Pool` esterno (il caso di
 * `src/lib/prisma.ts`), non lo chiude su `$disconnect()` a meno di
 * `disposeExternalPool` — lo lascia collegato. Il `DROP DATABASE ... WITH
 * (FORCE)` della pulizia finale termina quelle connessioni residue dal lato
 * server, e `pg-pool` la rialza come evento `error` sul pool: senza un
 * ascoltatore, Node la tratta come eccezione non gestita e fa crashare lo
 * script **dopo** che la misurazione è già stata stampata. Codice `57P01`
 * ("terminating connection due to administrator command") è esattamente
 * l'effetto atteso della nostra stessa pulizia, non un guasto: si inghiotte
 * solo quello.
 */
function ammortizzaChiusuraForzata(): void {
  process.on('uncaughtException', (error: unknown) => {
    if ((error as { code?: string })?.code === '57P01') return
    console.error(error)
    process.exit(1)
  })
}

async function main(): Promise<void> {
  ammortizzaChiusuraForzata()
  const suffisso = richiedeSuffisso()
  const dbName = workerDbName(1)

  console.log(`\nDatabase di misurazione: "${dbName}" su ${PG_SERVER} (TEST_DB_SUFFIX=${suffisso})\n`)

  await withAdminClient((client) => ricreaDatabase(client, dbName))
  let ambientePronto = false

  try {
    console.log('Applico lo schema Prisma...')
    await applicaSchema(dbName)
    await verificaSchemaApplicato(dbName)

    // Va chiamata prima di importare `@/lib/prisma`: quel modulo legge
    // DATABASE_URL al primo import (vedi il commento in env-guard.ts).
    applyTestEnv()
    ambientePronto = true

    const { prisma } = await import('../../src/lib/prisma')
    const { generaLotto } = await import('../../src/lib/services/reconciliation-batch-service')
    const { fascia } = await import('../../src/lib/reconciliation/punteggio')

    const movimenti = movimentiValidi()
    console.log(`Movimenti validi da caricare: ${movimenti.length} (di ${leggiMovimenti().length} letti)`)

    const venue = await prisma.venue.create({
      data: { name: 'Sede di misurazione — Task 9', code: `MISURA_${suffisso.toUpperCase()}` },
    })

    await prisma.bankTransaction.createMany({
      data: movimenti.map((m) => ({
        venueId: venue.id,
        transactionDate: m.data,
        description: m.causale.slice(0, 500) || '(causale assente)',
        amount: m.importo,
        bankTransactionCode: m.snapshot.proprietaryBankTransactionCode ?? null,
        providerTransactionId: m.snapshot.transactionId ?? null,
        importSource: 'PSD2_GOCARDLESS',
        status: 'PENDING',
      })),
    })

    const scadenze = costruisciScadenzeSintetiche(movimenti)
    await prisma.schedule.createMany({
      data: scadenze.map((s) => ({
        venueId: venue.id,
        tipo: 'passiva',
        descrizione: s.descrizione,
        importoTotale: s.importoTotale,
        dataScadenza: s.dataScadenza,
        numeroDocumento: s.numeroDocumento,
      })),
    })

    console.log(
      `Scadenze sintetiche generate: ${scadenze.length} (una per uscita col codice ${CODICE_BONIFICO}, ` +
        `importo identico, scadenza ${RITARDO_SINTETICO_GIORNI} giorni prima del movimento, ` +
        `numero documento dalla causale quando presente)`
    )

    const date = movimenti.map((m) => m.data.getTime())
    const dateFrom = new Date(Math.min(...date))
    const dateTo = new Date(Math.max(...date))

    // Intercetta l'array *vero* passato a `$transaction` dentro `generaLotto`,
    // senza toccare il codice del servizio: è la misura diretta della riserva
    // lasciata aperta dalla revisione, non una deduzione dal codice letto.
    const clienteMisurato = prisma as unknown as { $transaction: (...args: any[]) => Promise<unknown> }
    const transazioneOriginale = clienteMisurato.$transaction.bind(clienteMisurato)
    let dimensioneTransazione = -1
    clienteMisurato.$transaction = (...args: any[]) => {
      const primoArgomento = args[0]
      if (Array.isArray(primoArgomento)) dimensioneTransazione = primoArgomento.length
      return transazioneOriginale(...args)
    }

    console.log('\nEseguo generaLotto sull\'intero periodo...')
    const inizio = Date.now()
    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom,
      dateTo,
      regole: ['R1', 'R2', 'R3'],
      userId: null,
    })
    const durataMs = Date.now() - inizio

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
      include: { gambe: true },
    })
    const gambeTotali = proposte.reduce((totale, p) => totale + p.gambe.length, 0)

    // Cross-check indipendente: ricalcola la distribuzione per fascia dai
    // punteggi persistiti, invece di fidarsi solo di `esito.perFascia`.
    const fasceRicalcolate = { alta: 0, media: 0, bassa: 0 }
    for (const p of proposte) {
      fasceRicalcolate[fascia(p.punteggio)]++
    }
    const fasceCoincidono =
      fasceRicalcolate.alta === esito.perFascia.alta &&
      fasceRicalcolate.media === esito.perFascia.media &&
      fasceRicalcolate.bassa === esito.perFascia.bassa

    console.log('\n=== Risultato ===\n')
    console.log(`Movimenti bancari caricati:     ${movimenti.length}`)
    console.log(`Scadenze sintetiche caricate:    ${scadenze.length}`)
    console.log(`Periodo interrogato:              ${dateFrom.toISOString().slice(0, 10)} → ${dateTo.toISOString().slice(0, 10)}`)
    console.log(`Durata generaLotto:                ${durataMs} ms`)
    console.log(`Proposte totali:                   ${esito.contaProposte}`)
    console.log(`  fascia alta:                      ${esito.perFascia.alta}`)
    console.log(`  fascia media:                     ${esito.perFascia.media}`)
    console.log(`  fascia bassa:                     ${esito.perFascia.bassa}`)
    console.log(`Gambe totali (proposte cumulative inc.): ${gambeTotali}`)
    console.log(
      `Cross-check fasce dal DB coincide con esito.perFascia: ${fasceCoincidono ? 'sì' : 'NO — vedi sopra'}`
    )
    console.log(
      `Dimensione dell'array passato a $transaction: ${dimensioneTransazione} ` +
        `(= ${esito.contaProposte} proposte + 1 aggiornamento del contatore)`
    )
    console.log()

    // Attese/preventivo: nessuno finora aveva un numero.
    if (dimensioneTransazione !== esito.contaProposte + 1) {
      console.warn(
        'ATTENZIONE: la dimensione osservata della transazione non coincide con ' +
          'contaProposte + 1. Il codice di reconciliation-batch-service.ts potrebbe ' +
          'essere cambiato rispetto a quanto documentato qui.'
      )
    }
  } finally {
    // Pulizia: il database è di prova, ma lasciare centinaia di movimenti in
    // giro rende inaffidabili le esecuzioni successive — quindi lo si distrugge
    // per intero, non solo le righe scritte, il che copre anche un fallimento
    // a metà corsa. Si disconnette il client Prisma solo se l'ambiente è stato
    // preparato (altrimenti l'import userebbe una DATABASE_URL non nostra): il
    // `DROP DATABASE ... WITH (FORCE)` che segue chiude comunque ogni
    // connessione residua, quindi la disconnessione esplicita è solo un extra.
    if (ambientePronto) {
      const { prisma } = await import('../../src/lib/prisma')
      await prisma.$disconnect().catch(() => {})
    }
    await withAdminClient((client) => eliminaDatabase(client, dbName))
    console.log(`Database "${dbName}" ripulito.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
