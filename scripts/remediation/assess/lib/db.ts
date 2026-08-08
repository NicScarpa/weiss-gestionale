/**
 * Accesso al database in SOLA LETTURA per il censimento dei dati corrotti.
 *
 * Questo modulo è l'unico punto di contatto con il database di tutto il
 * censimento e non contiene alcuna scrittura: nessuna INSERT, UPDATE, DELETE,
 * nessuna istruzione DDL, nessun `$executeRaw`. La garanzia non è affidata
 * alla buona fede di chi scrive le query, ma a cinque barriere indipendenti:
 *
 *  1. la sessione si apre con `default_transaction_read_only=on` passato nel
 *     pacchetto di avvio della connessione: è il server a rifiutare ogni
 *     scrittura, non il nostro codice;
 *  2. all'apertura una sonda pretende dal server il rifiuto di una UPDATE che
 *     non tocca nessuna riga; se il server la accettasse, il censimento si
 *     interrompe invece di proseguire su una connessione scrivibile;
 *  3. tutto il censimento gira dentro `BEGIN ... REPEATABLE READ, READ ONLY`,
 *     che oltre a ribadire il divieto dà a tutti e quattro i controlli la
 *     stessa istantanea del database: i numeri sono confrontabili fra loro;
 *  4. la transazione si chiude sempre con ROLLBACK, mai con COMMIT;
 *  5. `query()` accetta solo testo che inizia per SELECT o WITH, privo di
 *     separatori di istruzione e di parole chiave di scrittura.
 *
 * Si usa `pg` diretto e non il client Prisma dell'applicazione per tre motivi
 * sostanziali, non di comodità:
 *
 *  - il client Prisma monta un'estensione di soft delete che inietta
 *    `deletedAt: null` in ogni findMany/count/aggregate/groupBy. Un censimento
 *    deve poter vedere anche le righe cancellate logicamente: un duplicato
 *    cancellato occupa comunque lo spazio di un indice unico totale, e un
 *    pagamento cancellato può aver lasciato dietro di sé il movimento sbagliato;
 *  - il client Prisma monta un'estensione di cifratura che decifra i campi
 *    sensibili in lettura. Leggendo grezzo, l'IBAN resta cifrato per tutto il
 *    percorso e il censimento gira senza bisogno della ENCRYPTION_KEY: l'unico
 *    segreto necessario è l'indirizzo del database;
 *  - il divieto di scrittura lato server (punti 1 e 3) non ha un equivalente
 *    nel client Prisma.
 */

import { Client } from 'pg'
import type { QueryResultRow } from 'pg'

/**
 * Passato nel pacchetto di avvio della connessione: nessuna istruzione SQL
 * viene eseguita per impostarlo, è già attivo alla prima query.
 */
const AVVIO_SOLA_LETTURA = '-c default_transaction_read_only=on'

const NOME_APPLICATIVO = 'weiss-censimento-sola-lettura'

/** SQLSTATE 25006: read_only_sql_transaction. */
const CODICE_SOLA_LETTURA = '25006'

/**
 * Parole che non possono comparire nel testo di una query del censimento.
 * Cercate fuori dalle stringhe letterali e con confini di parola, così che
 * `created_at`, `updated_at` e `deleted_at` non generino falsi positivi.
 */
const PAROLE_DI_SCRITTURA =
  /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|merge|vacuum|reindex|refresh|lock|comment|nextval|setval)\b/i

export interface DestinazioneConnessione {
  utente: string
  host: string
  porta: string
  database: string
}

/**
 * Connessione al database che può solo leggere. Va aperta con `apri()` e
 * chiusa con `chiudi()`; fra le due, `query()` esegue le sole SELECT.
 */
export class SolaLettura {
  private readonly client: Client
  private readonly url: string
  private inTransazione = false

  constructor(url: string) {
    this.url = url
    this.client = new Client({
      connectionString: url,
      options: AVVIO_SOLA_LETTURA,
      application_name: NOME_APPLICATIVO,
    })
  }

  /**
   * Descrive la destinazione senza mai esporre la password: serve a far
   * verificare al titolare, prima che parta il censimento, di essere puntato
   * al database che crede.
   */
  destinazione(): DestinazioneConnessione {
    try {
      const indirizzo = new URL(this.url)
      return {
        utente: indirizzo.username || '(non indicato)',
        host: indirizzo.hostname || '(non indicato)',
        porta: indirizzo.port || '5432',
        database: indirizzo.pathname.replace(/^\//, '') || '(non indicato)',
      }
    } catch {
      return { utente: '?', host: '?', porta: '?', database: '?' }
    }
  }

  async apri(): Promise<void> {
    await this.client.connect()
    await this.verificaSolaLettura()
    // REPEATABLE READ: i quattro controlli leggono tutti la stessa istantanea.
    await this.istruzioneDiTransazione(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
    )
    this.inTransazione = true
  }

  /**
   * Chiude sempre con ROLLBACK. Anche nell'ipotesi impossibile in cui tutte le
   * barriere precedenti avessero ceduto, nulla di quanto fatto qui resterebbe
   * scritto.
   */
  async chiudi(): Promise<void> {
    try {
      if (this.inTransazione) {
        await this.istruzioneDiTransazione('ROLLBACK')
        this.inTransazione = false
      }
    } finally {
      await this.client.end()
    }
  }

  /**
   * Esegue una SELECT. Il testo passa dal controllo di `validaLettura()`:
   * qualunque altra cosa solleva un errore prima ancora di raggiungere il
   * database.
   */
  async query<T extends QueryResultRow>(sql: string, parametri: unknown[] = []): Promise<T[]> {
    validaLettura(sql)
    const esito = await this.client.query<T>(sql, parametri)
    return esito.rows
  }

  /**
   * Pretende dal server il rifiuto di una scrittura che non tocca alcuna riga.
   * È l'unico punto in cui il modulo formula un'istruzione di scrittura, e lo
   * fa per dimostrare che il server la respinge: `WHERE false` garantisce che
   * anche in caso di accettazione nessun dato verrebbe modificato.
   */
  private async verificaSolaLettura(): Promise<void> {
    try {
      await this.client.query('UPDATE venues SET name = name WHERE false')
    } catch (errore) {
      const codice = (errore as { code?: string })?.code
      const messaggio = String((errore as { message?: string })?.message ?? errore)
      if (codice === CODICE_SOLA_LETTURA || /read-only|sola lettura/i.test(messaggio)) {
        return
      }
      throw new Error(
        `La sonda di sola lettura è fallita per un motivo diverso dal divieto di scrittura: ${messaggio}. ` +
          'Verificare di essere puntati al database del gestionale.'
      )
    }
    throw new Error(
      'Il server ha accettato una scrittura: la connessione NON è in sola lettura. ' +
        'Il censimento si interrompe. Controllare che il parametro default_transaction_read_only ' +
        'non sia sovrascritto dalla configurazione del server o dal pooler.'
    )
  }

  /**
   * Unica via per BEGIN/ROLLBACK, che non sono SELECT e quindi non passerebbero
   * da `validaLettura()`. Accetta solo le istruzioni di controllo transazione
   * elencate qui: non è un varco per lo SQL arbitrario.
   */
  private async istruzioneDiTransazione(istruzione: string): Promise<void> {
    const consentite = ['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY', 'ROLLBACK']
    if (!consentite.includes(istruzione)) {
      throw new Error(`Istruzione di transazione non consentita: ${istruzione}`)
    }
    await this.client.query(istruzione)
  }
}

/**
 * Verifica che il testo sia una sola istruzione di lettura. Non sostituisce il
 * divieto lato server, lo affianca: serve a far fallire in fase di sviluppo una
 * query che per errore scrivesse, invece di scoprirlo in produzione.
 */
export function validaLettura(sql: string): void {
  const senzaCommenti = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const compatto = senzaCommenti.trim()

  if (!/^(select|with)\b/i.test(compatto)) {
    throw new Error(`Query rifiutata: deve iniziare per SELECT o WITH. Ricevuto: ${anteprima(sql)}`)
  }

  const senzaPuntoEVirgolaFinale = compatto.replace(/;\s*$/, '')
  if (senzaPuntoEVirgolaFinale.includes(';')) {
    throw new Error(`Query rifiutata: contiene più di un'istruzione. Ricevuto: ${anteprima(sql)}`)
  }

  // Le parole chiave vanno cercate fuori dalle stringhe letterali, altrimenti
  // un valore come 'CREATE' in un confronto farebbe scattare l'allarme.
  const senzaLetterali = senzaPuntoEVirgolaFinale.replace(/'(?:[^']|'')*'/g, "''")
  const trovata = senzaLetterali.match(PAROLE_DI_SCRITTURA)
  if (trovata) {
    throw new Error(
      `Query rifiutata: contiene la parola di scrittura "${trovata[1]}". Ricevuto: ${anteprima(sql)}`
    )
  }
}

function anteprima(sql: string): string {
  const compatto = sql.replace(/\s+/g, ' ').trim()
  return compatto.length > 120 ? `${compatto.slice(0, 120)}…` : compatto
}
