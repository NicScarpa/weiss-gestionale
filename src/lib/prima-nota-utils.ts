import { money, sumMoney, toApi } from '@/lib/money'
import type { RegisterType, EntryType, JournalEntry } from '@/types/prima-nota'

/**
 * Determina se un movimento è DARE o AVERE in base al registro e tipo
 */
export function getMovementDirection(
  registerType: RegisterType,
  entryType: EntryType
): 'DEBIT' | 'CREDIT' {
  // CASSA
  if (registerType === 'CASH') {
    switch (entryType) {
      case 'INCASSO':
      case 'PRELIEVO': // Da banca → entra in cassa
        return 'DEBIT' // Dare (+)
      case 'USCITA':
      case 'VERSAMENTO': // Verso banca → esce da cassa
        return 'CREDIT' // Avere (-)
      case 'GIROCONTO':
        return 'DEBIT' // Default, dipende dal contesto
    }
  }

  // BANCA
  if (registerType === 'BANK') {
    switch (entryType) {
      case 'INCASSO':
      case 'VERSAMENTO': // Da cassa → entra in banca
        return 'DEBIT' // Dare (+)
      case 'USCITA':
      case 'PRELIEVO': // Verso cassa → esce da banca
        return 'CREDIT' // Avere (-)
      case 'GIROCONTO':
        return 'DEBIT' // Default, dipende dal contesto
    }
  }

  return 'DEBIT'
}

/**
 * Converte tipo movimento e importo in dare/avere.
 *
 * L'importo è generico perché la stessa decisione serve sia sui `number` della
 * UI sia sui `Money` che vanno in colonna: costringerli a passare da `number`
 * per attraversare questa funzione vanificherebbe la precisione (vedi
 * `@/lib/money`). Il valore non viene toccato, solo messo dalla parte giusta.
 */
export function toDebitCredit<T = number>(
  registerType: RegisterType,
  entryType: EntryType,
  amount: T
): { debitAmount: T | null; creditAmount: T | null } {
  const direction = getMovementDirection(registerType, entryType)

  if (direction === 'DEBIT') {
    return { debitAmount: amount, creditAmount: null }
  } else {
    return { debitAmount: null, creditAmount: amount }
  }
}

/**
 * Calcola il saldo progressivo per una lista di movimenti
 */
export function calculateRunningBalances(
  entries: JournalEntry[],
  openingBalance: number = 0
): JournalEntry[] {
  let balance = money(openingBalance)

  return entries.map((entry) => {
    // Saldo = precedente + dare - avere
    balance = balance.plus(money(entry.debitAmount)).minus(money(entry.creditAmount))

    return {
      ...entry,
      runningBalance: toApi(balance),
    }
  })
}

/**
 * Calcola totali per un gruppo di movimenti
 */
export function calculateTotals(entries: JournalEntry[]): {
  totalDebits: number
  totalCredits: number
  netMovement: number
} {
  const totalDebits = sumMoney(entries.map((entry) => entry.debitAmount))
  const totalCredits = sumMoney(entries.map((entry) => entry.creditAmount))

  return {
    totalDebits: toApi(totalDebits),
    totalCredits: toApi(totalCredits),
    netMovement: toApi(totalDebits.minus(totalCredits)),
  }
}

/**
 * Dettaglio uscita per generare descrizione
 */
interface ExpenseDetail {
  payee?: string
  description?: string
  documentRef?: string
}

/**
 * Genera descrizione automatica per movimento da chiusura
 */
export function generateClosureDescription(
  type: 'revenue' | 'expense' | 'deposit' | 'pos',
  closureDate: Date,
  detail?: string | ExpenseDetail
): string {
  const dateStr = closureDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  switch (type) {
    case 'revenue':
      return `Incasso giornaliero contanti ${dateStr}`
    case 'pos':
      return `Incasso giornaliero POS ${dateStr}`
    case 'expense':
      // Se detail è un oggetto ExpenseDetail
      if (detail && typeof detail === 'object') {
        const parts: string[] = []
        if (detail.payee) parts.push(detail.payee)
        if (detail.description) parts.push(detail.description)
        if (detail.documentRef) parts.push(`Rif. ${detail.documentRef}`)

        if (parts.length > 0) {
          return `${parts.join(' - ')} (${dateStr})`
        }
      }
      // Se detail è stringa (backward compatibility)
      if (typeof detail === 'string') {
        return `Uscita: ${detail} (${dateStr})`
      }
      return `Uscita ${dateStr}`
    case 'deposit':
      return `Versamento in banca ${dateStr}`
  }
}

/**
 * Formatta importo con segno per visualizzazione
 */
export function formatSignedAmount(
  debitAmount?: number | null,
  creditAmount?: number | null
): { value: number; sign: '+' | '-'; formatted: string } {
  if (debitAmount && debitAmount > 0) {
    return {
      value: debitAmount,
      sign: '+',
      formatted: `+${debitAmount.toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
      })}`,
    }
  }

  if (creditAmount && creditAmount > 0) {
    return {
      value: creditAmount,
      sign: '-',
      formatted: `-${creditAmount.toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
      })}`,
    }
  }

  return {
    value: 0,
    sign: '+',
    formatted: '€0,00',
  }
}

/**
 * Verifica se un movimento è modificabile
 * (non modificabile se generato automaticamente da chiusura validata)
 */
export function isEntryEditable(entry: JournalEntry): boolean {
  return !entry.closureId
}

/**
 * Raggruppa movimenti per data
 */
export function groupEntriesByDate(
  entries: JournalEntry[]
): Map<string, JournalEntry[]> {
  const grouped = new Map<string, JournalEntry[]>()

  for (const entry of entries) {
    const dateKey = new Date(entry.date).toISOString().split('T')[0]
    const existing = grouped.get(dateKey) || []
    grouped.set(dateKey, [...existing, entry])
  }

  return grouped
}
