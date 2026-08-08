/**
 * Accesso diretto al database dai test end-to-end.
 *
 * Serve per due cose che dal browser non si possono fare in modo onesto:
 * preparare lo stato di partenza (azzerare `mustChangePassword`, liberare il
 * giorno della chiusura di prova) e verificare il dato *salvato* invece di
 * quello mostrato — che è tutta la differenza fra un test sulla data della
 * scadenza e un test sul testo di un bottone.
 *
 * Il client Prisma è istanziato qui e non importato da `src/lib/prisma.ts`
 * apposta: quello monta l'estensione soft delete, e un test che vuole vedere
 * anche le righe cancellate deve poterlo fare.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

/**
 * Il guard non è cerimonia: su questa macchina il `.env` del progetto punta a
 * Supabase di produzione, e un test che tocca chiusure lì dentro tocca chiusure
 * vere. Si esce prima di aprire la connessione.
 */
function urlLocaleVerificata(): string {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      'DATABASE_URL non impostata: i test e2e vogliono un database locale ' +
        '(vedi e2e/README.md).'
    )
  }

  const host = new URL(url).hostname
  const localiAmmessi = ['127.0.0.1', 'localhost', '::1']

  if (!localiAmmessi.includes(host)) {
    throw new Error(
      `I test e2e rifiutano di lavorare su un database non locale (host: ${host}). ` +
        'Puntare DATABASE_URL a un Postgres su 127.0.0.1.'
    )
  }

  return url
}

let client: PrismaClient | null = null
let pool: Pool | null = null

export function db(): PrismaClient {
  if (!client) {
    // Prisma 7 vuole un driver adapter: `datasourceUrl` non esiste più.
    pool = new Pool({ connectionString: urlLocaleVerificata(), ssl: false, max: 4 })
    client = new PrismaClient({ adapter: new PrismaPg(pool) })
  }
  return client
}

export async function chiudiDb(): Promise<void> {
  if (client) {
    await client.$disconnect()
    client = null
  }
  if (pool) {
    await pool.end()
    pool = null
  }
}

/**
 * Gli utenti del seed nascono con `mustChangePassword: true`, e
 * `src/lib/api-utils.ts` risponde 403 a ogni chiamata API finché il flag c'è:
 * senza azzerarlo l'applicazione è inutilizzabile e ogni test fallirebbe per il
 * motivo sbagliato. Resta acceso su manager@weisscafe.it, che è l'utente con
 * cui `login.spec.ts` verifica la modale di cambio obbligatorio.
 */
export async function sbloccaUtente(email: string): Promise<void> {
  await db().user.updateMany({
    where: { email },
    data: { mustChangePassword: false },
  })
}

export async function rimettiCambioPasswordObbligatorio(email: string): Promise<void> {
  await db().user.updateMany({
    where: { email },
    data: { mustChangePassword: true },
  })
}

/** Il giorno civile 'yyyy-MM-dd' come lo intende una colonna `@db.Date`. */
export function giornoUtc(giorno: string): Date {
  return new Date(`${giorno}T00:00:00.000Z`)
}

/**
 * La chiusura è unica per (sede, giorno) finché non è cancellata: senza questa
 * pulizia il secondo giro di test riceverebbe un 409 e si dovrebbe indovinare
 * se è un difetto o un residuo del giro precedente.
 *
 * Si marca `deletedAt` invece di cancellare perché tutte le relazioni della
 * chiusura sono `onDelete: Restrict` — la cancellazione fisica fallirebbe — e
 * perché è esattamente il modo in cui l'applicazione libera il giorno.
 */
export async function liberaGiornoChiusura(giorno: string): Promise<void> {
  await db().dailyClosure.updateMany({
    where: { date: giornoUtc(giorno), deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

export async function statoChiusuraDelGiorno(giorno: string) {
  return db().dailyClosure.findFirst({
    where: { date: giornoUtc(giorno), deletedAt: null },
    select: { id: true, status: true, date: true },
  })
}

export async function archiviaMovimentiPerDescrizione(descrizione: string): Promise<void> {
  await db().journalEntry.updateMany({
    where: { description: descrizione, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

export async function archiviaScadenzePerDescrizione(descrizione: string): Promise<void> {
  await db().schedule.updateMany({
    where: { descrizione, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

/** Solo le scadenze vive: quelle archiviate da un giro precedente non contano. */
export async function scadenzeVivePerDescrizione(descrizione: string) {
  return db().schedule.findMany({
    where: { descrizione, deletedAt: null },
    select: { id: true, dataScadenza: true, importoTotale: true, stato: true },
  })
}
