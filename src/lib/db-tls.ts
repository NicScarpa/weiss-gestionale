/**
 * Politica TLS della connessione al database.
 *
 * In produzione la connessione è cifrata e il certificato va verificato: il
 * database sta su Supabase, dietro internet, e contiene la contabilità.
 *
 * L'unica eccezione è un PostgreSQL sulla macchina stessa. Serve per far girare
 * davvero una build di produzione in locale (`npm run build && npm start`), che
 * è l'unico modo di provare ciò che in sviluppo non esiste — il service worker,
 * il comportamento offline, la PWA. Senza questa via d'uscita l'unica strada
 * era interporre un proxy TLS finto davanti a Postgres, e infatti è quello che
 * è stato fatto due volte prima di scriverla.
 *
 * L'eccezione non è comandata da un interruttore: dipende da dove punta
 * `DATABASE_URL`. Un interruttore si può accendere per sbaglio sul server di
 * produzione, un indirizzo di loopback no — su Railway `DATABASE_URL` punta a
 * Supabase e questo codice non ha modo di allentare nulla. Nel dubbio si chiude:
 * qualunque stringa che non si riesca a riconoscere come locale ottiene il TLS.
 */

/** Host che valgono come «questa macchina». Confronto esatto, mai per suffisso. */
const HOST_LOCALI = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * Parametri di query con cui `pg` permette di riscrivere la destinazione,
 * scavalcando l'host scritto nell'autorità dell'URL. La loro sola presenza
 * chiude la via d'uscita: senza questo controllo
 * `postgresql://u:p@127.0.0.1/db?host=db.xxx.supabase.co` sembrerebbe locale e
 * aprirebbe una connessione in chiaro verso la produzione.
 */
const PARAMETRI_CHE_RISCRIVONO_LA_DESTINAZIONE = new Set(['host', 'hostaddr'])

function connessioneSullaMacchinaStessa(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false

  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    return false
  }

  for (const chiave of url.searchParams.keys()) {
    if (PARAMETRI_CHE_RISCRIVONO_LA_DESTINAZIONE.has(chiave.toLowerCase())) return false
  }

  return HOST_LOCALI.has(url.hostname.toLowerCase())
}

export interface AmbienteConnessione {
  NODE_ENV?: string
  DATABASE_URL?: string
  /**
   * Il pooler di Supabase presenta una catena firmata da una CA che non sta
   * nell'archivio di Node: la verifica stretta ha bisogno di questo certificato.
   */
  DATABASE_CA_CERT?: string
}

export type OpzioneTls = false | { ca?: string; rejectUnauthorized: true }

/** Opzione `ssl` da passare alla Pool di `pg` per l'ambiente dato. */
export function opzioneTls(env: AmbienteConnessione): OpzioneTls {
  if (env.NODE_ENV !== 'production') return false
  if (connessioneSullaMacchinaStessa(env.DATABASE_URL)) return false

  return env.DATABASE_CA_CERT
    ? { ca: env.DATABASE_CA_CERT, rejectUnauthorized: true }
    : { rejectUnauthorized: true }
}
