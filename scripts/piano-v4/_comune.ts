/**
 * Utilità condivise dagli script del piano dei conti v4 (02, 03, 04).
 *
 * Qui vive l'unica definizione delle 14 chiavi esterne che puntano ad
 * `accounts`: se un domani lo schema ne aggiunge una, si aggiorna QUESTO
 * elenco e report, guardie della migrazione e rollback restano allineati.
 *
 * Nessuno script di questa cartella usa il client Prisma dell'applicazione
 * (`src/lib/prisma.ts`): quello applica soft-delete e cifratura dei campi
 * sensibili, e per una migrazione del piano dei conti servono invece i dati
 * grezzi — un movimento cancellato logicamente continua a occupare la sua
 * FK e va contato come riferimento vero.
 */
import { createInterface } from 'node:readline/promises'

import { PrismaClient, Prisma } from '@prisma/client'
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

/**
 * Client Prisma su cui lavorano le funzioni di questo modulo.
 *
 * Anche i client di transazione vanno bene: espongono gli stessi delegate per
 * modello. Il loro tipo (`Prisma.TransactionClient`) però manda in crisi le
 * firme generiche di `groupBy`, quindi al bordo della transazione si passa da
 * `comeDb()` invece di allargare qui il tipo a un'unione.
 */
export type Db = PrismaClient

/** Adatta un client di transazione al tipo Db: a runtime sono gli stessi delegate. */
export function comeDb(tx: Prisma.TransactionClient): Db {
  return tx as unknown as Db
}

export function creaClient(): { prisma: PrismaClient; chiudi: () => Promise<void> } {
  // Senza DATABASE_URL il driver `pg` ricadrebbe sui default di libpq
  // (utente di sistema, database omonimo, socket locale) e lo script si
  // metterebbe a lavorare su un database che nessuno ha scelto.
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL non impostata: non so su quale database operare.')
    console.error('   Esempio:')
    console.error('     DATABASE_URL="postgresql://utente@host:5432/nomedb" npx tsx <script>')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })
  return {
    prisma,
    chiudi: async () => {
      await prisma.$disconnect()
    },
  }
}

/**
 * Identità del database bersaglio: `utente@nomedb su host:porta`. Senza
 * password, mai, da nessuna parte.
 *
 * Servono tutti e quattro i pezzi, perché quale sia quello discriminante
 * dipende da come ci si collega:
 *  - Supabase, *pooler*: host uguale per tutti i progetti, database sempre
 *    `postgres`, a distinguere è lo username (`postgres.<ref>`);
 *  - Supabase, *connessione diretta* (quella consigliata per la migrazione):
 *    utente `postgres` e database `postgres` per ogni progetto, a
 *    distinguere è l'host (`db.<ref>.supabase.co`);
 *  - Railway: più database sono `postgres@railway`, distingue l'host.
 * Un'identità che ne omettesse uno collasserebbe su bersagli diversi, e
 * confrontare due stringhe identiche non è un controllo.
 *
 * Questa è la stringa che si ribatte a mano per confermare una scrittura su
 * un bersaglio remoto, ed è quella che il rollback confronta con lo snapshot.
 */
export function descriviDatabase(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) return '(DATABASE_URL non impostata)'
  try {
    const u = new URL(raw)
    const utente = decodeURIComponent(u.username) || '(senza utente)'
    const nome = decodeURIComponent(u.pathname.replace(/^\//, '')) || '(senza nome)'
    return `${utente}@${nome} su ${u.hostname}:${u.port || '5432'}`
  } catch {
    return '(DATABASE_URL non interpretabile)'
  }
}

/**
 * Identità adatta a finire in un file che il repository traccia.
 *
 * `docs/migrazione-piano-conti-v4.md` è versionato: rigenerarlo contro la
 * produzione e committarlo depositerebbe utente e host di produzione nella
 * storia del repository. Su bersaglio remoto si scrive un segnaposto.
 */
export function descriviDatabasePerDocumento(): string {
  return bersaglioRemoto()
    ? '(bersaglio remoto — coordinate omesse: questo documento è tracciato dal repository)'
    : descriviDatabase()
}

/**
 * true se DATABASE_URL non punta alla macchina locale.
 *
 * Euristica sull'hostname, quindi imperfetta: un tunnel SSH che espone la
 * produzione su 127.0.0.1 passerebbe per locale. Serve a decidere quanto
 * alzare l'asticella della conferma, non a garantire nulla.
 */
export function bersaglioRemoto(): boolean {
  const raw = process.env.DATABASE_URL
  if (!raw) return false
  try {
    const host = new URL(raw).hostname
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
  } catch {
    return false
  }
}

/**
 * Intestazione obbligatoria di ogni script: prima di qualsiasi lettura o
 * scrittura si dichiara su quale database si sta per operare.
 */
export function stampaIntestazione(titolo: string, modalita: string) {
  console.log('')
  console.log('═'.repeat(78))
  console.log(`  ${titolo}`)
  console.log(`  Database : ${descriviDatabase()}`)
  console.log(`  Modalità : ${modalita}`)
  if (bersaglioRemoto()) {
    console.log('  ⚠️  ATTENZIONE: il bersaglio NON è locale. Potrebbe essere la PRODUZIONE.')
  }
  console.log('═'.repeat(78))
  console.log('')
}

/** Attesa con conto alla rovescia, per dare il tempo di annullare con Ctrl-C. */
export async function contoAllaRovescia(secondi: number) {
  for (let i = secondi; i > 0; i--) {
    process.stdout.write(`\r  Inizio fra ${i}s… (Ctrl-C per annullare)   `)
    await new Promise((r) => setTimeout(r, 1000))
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r')
}

/**
 * Ultimo cancello prima di scrivere.
 *
 * Su un bersaglio locale bastano cinque secondi di conto alla rovescia. Su un
 * bersaglio remoto no: un countdown scade da solo se nessuno guarda lo
 * schermo, e "nessuno guarda lo schermo" è precisamente il caso in cui non si
 * vuole scrivere in produzione per sbaglio. Lì si deve ribattere a mano
 * l'identità del bersaglio, che non si può azzeccare per distrazione.
 */
export async function confermaScrittura() {
  if (!bersaglioRemoto()) {
    await contoAllaRovescia(5)
    return
  }

  const atteso = descriviDatabase()
  console.log('  ⚠️  Bersaglio NON locale: la conferma automatica non basta.')
  console.log('')

  if (!process.stdin.isTTY) {
    console.error('❌ Serve una conferma interattiva ma lo standard input non è un terminale.')
    console.error(`   Rilanciare da un terminale: va ribattuto "${atteso}".`)
    process.exit(1)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let risposta: string
  try {
    risposta = await rl.question(`  Ribatti l'identità del bersaglio per confermare — ${atteso}\n  > `)
  } catch {
    // Ctrl-D, Ctrl-C o stdin che si chiude: è un rifiuto, non un incidente.
    // Senza questo l'uscita sarebbe uno stack trace, che spaventa e non spiega.
    rl.close()
    console.error('')
    console.error('❌ Conferma interrotta. Nessuna scrittura effettuata.')
    process.exit(1)
  }
  rl.close()

  if (risposta.trim() !== atteso) {
    console.error('')
    console.error(`❌ Il testo non coincide (atteso "${atteso}"). Nessuna scrittura effettuata.`)
    process.exit(1)
  }
  console.log('')
}

/**
 * Rifiuta gli argomenti che non conosce.
 *
 * Un refuso in `--mantieni-budget` oggi passerebbe in silenzio e le righe di
 * budget verrebbero cancellate lo stesso: proprio il flag che protegge dei
 * dati è quello dove un errore di battitura non deve poter passare.
 */
export function validaArgomenti(flagNoti: string[], opzioniNote: string[] = []) {
  const argomenti = process.argv.slice(2)
  const sconosciuti: string[] = []

  for (let i = 0; i < argomenti.length; i++) {
    const token = argomenti[i]
    if (!token.startsWith('--')) {
      sconosciuti.push(token)
      continue
    }
    const nome = token.slice(2).split('=')[0]
    if (opzioniNote.includes(nome)) {
      // Il valore può stare nel token stesso (--nome=valore) o in quello dopo.
      if (!token.includes('=')) i++
      continue
    }
    if (flagNoti.includes(nome)) continue
    sconosciuti.push(token)
  }

  if (sconosciuti.length > 0) {
    console.error(`❌ Argomenti non riconosciuti: ${sconosciuti.join(' ')}`)
    console.error(`   Flag ammessi   : ${flagNoti.map((f) => `--${f}`).join(', ') || '(nessuno)'}`)
    console.error(
      `   Opzioni ammesse: ${opzioniNote.map((o) => `--${o} <valore>`).join(', ') || '(nessuna)'}`
    )
    process.exit(1)
  }
}

// ════════════════════════════════════════════════════════════════════════
//  LE 14 CHIAVI ESTERNE VERSO accounts
// ════════════════════════════════════════════════════════════════════════

interface Conteggio {
  accountId: string
  n: number
}

export interface Riferimento {
  /** Nome della colonna nel database, come compare nei report. */
  chiave: string
  /**
   * "Duro" = riferimento contabile o di imputazione che rende il conto
   * realmente usato: disattivarlo falserebbe scritture esistenti. Sono le
   * quattro famiglie che bloccano la migrazione.
   * "Morbido" = preferenza o configurazione: sopravvive alla disattivazione
   * del conto ma va rivista a mano.
   */
  duro: boolean
  conta: (db: Db, ids: string[]) => Promise<Conteggio[]>
}

/**
 * Riduce il risultato di un groupBy a coppie (conto, quante righe).
 * Il parametro è `unknown[]` di proposito: dare a `groupBy` un tipo atteso
 * ne rompe l'inferenza dei generici, e ci ritroveremmo con i falsi errori di
 * TypeScript che Prisma usa per segnalare argomenti incompatibili.
 */
function perCampo(righe: unknown[], campo: string): Conteggio[] {
  return (righe as Record<string, unknown>[])
    .filter((r) => r[campo] !== null && r[campo] !== undefined)
    .map((r) => ({
      accountId: r[campo] as string,
      n: (r._count as { _all: number })._all,
    }))
}

export const RIFERIMENTI: readonly Riferimento[] = [
  {
    chiave: 'journal_entries.account_id',
    duro: true,
    conta: async (db, ids) => {
      const righe = await db.journalEntry.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'journal_entries.counterpart_id',
    duro: true,
    conta: async (db, ids) => {
      const righe = await db.journalEntry.groupBy({
        by: ['counterpartId'],
        where: { counterpartId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'counterpartId')
    },
  },
  {
    chiave: 'journal_entry_allocations.account_id',
    duro: true,
    conta: async (db, ids) => {
      const righe = await db.journalEntryAllocation.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'invoice_line_accounts.account_id',
    duro: true,
    conta: async (db, ids) => {
      const righe = await db.invoiceLineAccount.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'supplier_product_accounts.account_id',
    duro: true,
    conta: async (db, ids) => {
      const righe = await db.supplierProductAccount.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'daily_expenses.account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.dailyExpense.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'electronic_invoices.account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.electronicInvoice.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'suppliers.default_account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.supplier.groupBy({
        by: ['defaultAccountId'],
        where: { defaultAccountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'defaultAccountId')
    },
  },
  {
    chiave: 'customers.default_account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.customer.groupBy({
        by: ['defaultAccountId'],
        where: { defaultAccountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'defaultAccountId')
    },
  },
  {
    chiave: 'categorization_rules.account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.categorizationRule.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'schedule_rules.conto_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.scheduleRule.groupBy({
        by: ['contoId'],
        where: { contoId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'contoId')
    },
  },
  {
    chiave: 'recurring_expenses.account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.recurringExpense.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'account_budget_mappings.account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.accountBudgetMapping.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
  {
    chiave: 'budget_lines.account_id',
    duro: false,
    conta: async (db, ids) => {
      const righe = await db.budgetLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: ids } },
        _count: { _all: true },
      })
      return perCampo(righe, 'accountId')
    },
  },
]

export const CHIAVI_DURE = RIFERIMENTI.filter((r) => r.duro).map((r) => r.chiave)

export interface RiepilogoRiferimenti {
  dettaglio: Record<string, number>
  duri: number
  morbidi: number
  totale: number
}

export function riferimentiVuoti(): RiepilogoRiferimenti {
  return { dettaglio: {}, duri: 0, morbidi: 0, totale: 0 }
}

/**
 * Conta, per ciascun conto indicato, i riferimenti su tutte le 14 FK.
 * Ricontare è sempre più sicuro che fidarsi di un numero raccolto prima:
 * questa funzione viene richiamata anche dentro la transazione di migrazione.
 */
export async function contaRiferimenti(
  db: Db,
  accountIds: string[]
): Promise<Map<string, RiepilogoRiferimenti>> {
  const mappa = new Map<string, RiepilogoRiferimenti>()
  for (const id of accountIds) mappa.set(id, riferimentiVuoti())
  if (accountIds.length === 0) return mappa

  for (const rif of RIFERIMENTI) {
    const righe = await rif.conta(db, accountIds)
    for (const { accountId, n } of righe) {
      if (n === 0) continue
      const corrente = mappa.get(accountId)
      if (!corrente) continue
      corrente.dettaglio[rif.chiave] = (corrente.dettaglio[rif.chiave] ?? 0) + n
      corrente.totale += n
      if (rif.duro) corrente.duri += n
      else corrente.morbidi += n
    }
  }

  return mappa
}

/** "budget_lines.account_id: 13; categorization_rules.account_id: 2" */
export function formattaDettaglio(r: RiepilogoRiferimenti): string {
  const voci = Object.entries(r.dettaglio)
  if (voci.length === 0) return 'nessuno'
  return voci.map(([k, v]) => `${k}: ${v}`).join('; ')
}

/** Come formattaDettaglio ma solo sulle chiavi bloccanti. */
export function formattaDettaglioDuri(r: RiepilogoRiferimenti): string {
  const duri = new Set(CHIAVI_DURE)
  const voci = Object.entries(r.dettaglio).filter(([k]) => duri.has(k))
  if (voci.length === 0) return 'nessuno'
  return voci.map(([k, v]) => `${k}: ${v}`).join('; ')
}

/** Come formattaDettaglio ma solo sulle chiavi non bloccanti. */
export function formattaDettaglioMorbidi(r: RiepilogoRiferimenti): string {
  const duri = new Set(CHIAVI_DURE)
  const voci = Object.entries(r.dettaglio).filter(([k]) => !duri.has(k))
  if (voci.length === 0) return 'nessuno'
  return voci.map(([k, v]) => `${k}: ${v}`).join('; ')
}

/** Legge un argomento `--nome valore` dalla riga di comando. */
export function argomento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1]
  }
  const conUguale = process.argv.find((a) => a.startsWith(`--${nome}=`))
  return conUguale ? conUguale.slice(nome.length + 3) : undefined
}

export function flag(nome: string): boolean {
  return process.argv.includes(`--${nome}`)
}
