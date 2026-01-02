import { prisma } from '@/lib/prisma'
import { generateClosureDescription } from '@/lib/prima-nota-utils'

interface CashStation {
  cashAmount: number | null
  posAmount: number | null
  floatAmount: number | null
}

interface Expense {
  amount: number
  description: string | null
  accountId: string | null
}

interface Closure {
  id: string
  date: Date
  venueId: string
  bankDeposit: number | null
  stations: CashStation[]
  expenses: Expense[]
}

/**
 * Genera movimenti prima nota automatici quando una chiusura viene validata
 */
export async function generateJournalEntriesFromClosure(
  closure: Closure,
  userId: string
): Promise<{ entriesCreated: number; totalDebits: number; totalCredits: number }> {
  const entries: any[] = []
  let totalDebits = 0
  let totalCredits = 0

  // Calcola totale incassi (contanti + POS)
  const totalCash = closure.stations.reduce(
    (sum, s) => sum + (Number(s.cashAmount) || 0),
    0
  )
  const totalPos = closure.stations.reduce(
    (sum, s) => sum + (Number(s.posAmount) || 0),
    0
  )
  const totalRevenue = totalCash + totalPos

  // 1. Movimento INCASSO su CASSA per totale incassi contanti
  if (totalCash > 0) {
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'CASH',
      description: generateClosureDescription('revenue', closure.date),
      debitAmount: totalCash,
      creditAmount: null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += totalCash
  }

  // 2. Movimenti USCITA su CASSA per ogni spesa
  for (const expense of closure.expenses) {
    if (expense.amount > 0) {
      entries.push({
        venueId: closure.venueId,
        date: closure.date,
        registerType: 'CASH',
        description: generateClosureDescription('expense', closure.date, expense.description || undefined),
        debitAmount: null,
        creditAmount: expense.amount,
        accountId: expense.accountId,
        closureId: closure.id,
        createdById: userId,
      })
      totalCredits += expense.amount
    }
  }

  // 3. Movimento VERSAMENTO se presente (coppia cassa → banca)
  const bankDeposit = Number(closure.bankDeposit) || 0
  if (bankDeposit > 0) {
    // Uscita da cassa
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'CASH',
      description: generateClosureDescription('deposit', closure.date),
      debitAmount: null,
      creditAmount: bankDeposit,
      closureId: closure.id,
      createdById: userId,
    })
    totalCredits += bankDeposit

    // Entrata in banca
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'BANK',
      description: generateClosureDescription('deposit', closure.date),
      debitAmount: bankDeposit,
      creditAmount: null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += bankDeposit
  }

  // Crea tutti i movimenti in una transazione
  if (entries.length > 0) {
    await prisma.journalEntry.createMany({
      data: entries,
    })
  }

  return {
    entriesCreated: entries.length,
    totalDebits,
    totalCredits,
  }
}

/**
 * Elimina i movimenti prima nota generati da una chiusura
 * (utile se la chiusura viene riportata a DRAFT dopo rifiuto)
 */
export async function deleteJournalEntriesForClosure(closureId: string) {
  const result = await prisma.journalEntry.deleteMany({
    where: { closureId },
  })

  return result.count
}
