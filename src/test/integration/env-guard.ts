/**
 * Guardia d'ambiente per i test di integrazione.
 *
 * I test di integrazione girano su PostgreSQL vero e fanno TRUNCATE: puntarli
 * per sbaglio alla produzione significherebbe cancellare la contabilità. Per
 * questo la `DATABASE_URL` non viene mai *letta* dall'ambiente ma **calcolata**
 * qui, e il solo pezzo configurabile (l'URL del server locale) viene validato
 * prima di essere usato. Il nome del database lo decide sempre l'harness.
 *
 * Il modulo si valida al primo import: se l'ambiente non è accettabile,
 * l'harness non parte affatto invece di partire e fare danni.
 */

/** Prefisso obbligatorio dei database di test: su questo si basa `assertTestDb`. */
export const TEST_DB_PREFIX = 'weiss_itest_'

/** Database modello: schema + seed, clonato per ogni worker. */
export const TEMPLATE_DB = `${TEST_DB_PREFIX}template`

/**
 * Numero massimo di worker paralleli. Vale sia per `maxWorkers` di Vitest sia
 * per il numero di database clonati: i due devono coincidere, altrimenti un
 * worker si ritroverebbe senza database.
 */
export const MAX_WORKERS = 4

/**
 * Chiave di cifratura dei test. L'applicazione la decodifica da base64 e
 * AES-256-GCM pretende 32 byte *decodificati*: qui partiamo da una stringa di
 * 32 caratteri ASCII, così il conto torna per costruzione. Una chiave di 64
 * caratteri esadecimali decodificherebbe a 48 byte e farebbe fallire ogni
 * scrittura su campo cifrato con `Invalid key length`.
 */
export const TEST_ENCRYPTION_KEY = Buffer.from(
  'test-key-test-key-test-key-test!'
).toString('base64')

export const TEST_NEXTAUTH_SECRET = 'weiss-itest-secret'

/** Host considerati locali: qualunque altro host è rifiutato. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/** Server PostgreSQL locale usato dai test. Sovrascrivibile, ma sempre validato. */
const DEFAULT_BASE_URL = 'postgresql://nicolascarpa@127.0.0.1:5433'

class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(
      `${message}\n` +
        'I test di integrazione girano solo su un PostgreSQL locale: ' +
        'imposta TEST_PG_BASE_URL su 127.0.0.1/localhost oppure lasciala vuota.'
    )
    this.name = 'UnsafeTestDatabaseError'
  }
}

/**
 * Valida l'URL del server e ne restituisce le parti utili. Rifiuta host non
 * locali e qualunque riferimento a Supabase (la produzione), anche se
 * mascherato altrove nella stringa.
 */
function parseBaseUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeTestDatabaseError(`TEST_PG_BASE_URL non è un URL valido: "${raw}".`)
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new UnsafeTestDatabaseError(
      `Protocollo non supportato: "${url.protocol}" (atteso postgresql://).`
    )
  }

  if (raw.toLowerCase().includes('supabase')) {
    throw new UnsafeTestDatabaseError(
      'L\'URL contiene "supabase": è il database di produzione.'
    )
  }

  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new UnsafeTestDatabaseError(`Host non locale: "${url.hostname}".`)
  }

  return url
}

const baseUrl = parseBaseUrl(process.env.TEST_PG_BASE_URL ?? DEFAULT_BASE_URL)

/** Host:porta del server locale, senza database: utile nei messaggi d'errore. */
export const PG_SERVER = `${baseUrl.hostname}:${baseUrl.port || '5432'}`

/**
 * URL di connessione a un database *specifico* del server locale. Il nome deve
 * cominciare col prefisso dei test, tranne che per il database amministrativo
 * (`postgres`) da cui si creano e si eliminano gli altri.
 */
export function databaseUrl(name: string): string {
  if (name !== 'postgres' && !name.startsWith(TEST_DB_PREFIX)) {
    throw new UnsafeTestDatabaseError(
      `Nome database non consentito: "${name}" (atteso il prefisso "${TEST_DB_PREFIX}").`
    )
  }

  const url = new URL(baseUrl.toString())
  url.pathname = `/${name}`
  return url.toString()
}

/** URL del database amministrativo, da cui si fanno CREATE/DROP DATABASE. */
export function adminDatabaseUrl(): string {
  return databaseUrl('postgres')
}

/** Nome del database assegnato a un worker (1-based, come `VITEST_POOL_ID`). */
export function workerDbName(workerId: number): string {
  return `${TEST_DB_PREFIX}${workerId}`
}

/** Elenco dei database da clonare dal template, uno per worker. */
export function allWorkerDbNames(): string[] {
  return Array.from({ length: MAX_WORKERS }, (_, i) => workerDbName(i + 1))
}

/**
 * Worker corrente. Vitest valorizza `VITEST_POOL_ID` a partire da 1; fuori dai
 * worker (per esempio nel global setup) si ricade sul primo database.
 */
function currentWorkerId(): number {
  const raw = Number(process.env.VITEST_POOL_ID)
  if (!Number.isInteger(raw) || raw < 1) return 1
  // Più file che worker: gli id restano nell'intervallo dei database clonati.
  return ((raw - 1) % MAX_WORKERS) + 1
}

/**
 * Imposta l'ambiente dei test di integrazione. Va chiamata **prima** che venga
 * importato `src/lib/prisma.ts`: quel modulo legge `DATABASE_URL` al primo
 * import e crea la Pool una volta sola.
 */
export function applyTestEnv(): void {
  process.env.DATABASE_URL = databaseUrl(workerDbName(currentWorkerId()))
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
  process.env.NEXTAUTH_SECRET = TEST_NEXTAUTH_SECRET
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
}

/** Ambiente da passare ai sottoprocessi (prisma db push, seed) del global setup. */
export function childEnv(dbName: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl(dbName),
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    NEXTAUTH_SECRET: TEST_NEXTAUTH_SECRET,
    // Il seed si rifiuta di girare in produzione: qui siamo in test, ma la
    // variabile va detta esplicitamente perché i sottoprocessi non la ereditano
    // da Vitest.
    NODE_ENV: 'test',
  }
}
