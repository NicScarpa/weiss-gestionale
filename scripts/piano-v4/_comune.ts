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

/** Descrizione leggibile del database bersaglio, senza credenziali. */
export function descriviDatabase(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) return '(DATABASE_URL non impostata)'
  try {
    const u = new URL(raw)
    const nome = u.pathname.replace(/^\//, '') || '(senza nome)'
    return `${nome} @ ${u.hostname}:${u.port || '5432'}`
  } catch {
    return '(DATABASE_URL non interpretabile)'
  }
}

/** true se DATABASE_URL non punta alla macchina locale (quindi forse alla produzione). */
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
