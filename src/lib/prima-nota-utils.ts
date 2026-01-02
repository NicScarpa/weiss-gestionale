import Decimal from 'decimal.js'
import type { RegisterType, EntryType, JournalEntry } from '@/types/prima-nota'

// Configura Decimal.js per precisione finanziaria
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

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
 * Converte tipo movimento e importo in dare/avere
 */
export function toDebitCredit(
  registerType: RegisterType,
  entryType: EntryType,
  amount: number
): { debitAmount: number | null; creditAmount: number | null } {
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
  let balance = new Decimal(openingBalance)

  return entries.map((entry) => {
    const debit = new Decimal(entry.debitAmount || 0)
    const credit = new Decimal(entry.creditAmount || 0)

    // Saldo = precedente + dare - avere
    balance = balance.plus(debit).minus(credit)

    return {
      ...entry,
      runningBalance: balance.toNumber(),
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
  let totalDebits = new Decimal(0)
  let totalCredits = new Decimal(0)

  for (const entry of entries) {
    totalDebits = totalDebits.plus(entry.debitAmount || 0)
    totalCredits = totalCredits.plus(entry.creditAmount || 0)
  }

  return {
    totalDebits: totalDebits.toNumber(),
    totalCredits: totalCredits.toNumber(),
    netMovement: totalDebits.minus(totalCredits).toNumber(),
  }
}

/**
 * Genera descrizione automatica per movimento da chiusura
 */
export function generateClosureDescription(
  type: 'revenue' | 'expense' | 'deposit',
  closureDate: Date,
  detail?: string
): string {
  const dateStr = closureDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  switch (type) {
    case 'revenue':
      return `Incasso giornaliero ${dateStr}`
    case 'expense':
      return detail ? `Uscita: ${detail} (${dateStr})` : `Uscita ${dateStr}`
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
