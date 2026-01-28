import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generateClosureDescription } from '@/lib/prima-nota-utils'

interface CashStation {
  cashAmount: number | null
  posAmount: number | null
  floatAmount: number | null
}

interface Expense {
  amount: number
  payee: string | null
  description: string | null
  documentRef: string | null
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
  const entries: Prisma.JournalEntryCreateManyInput[] = []
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

  // Calcola totale uscite pagate in contanti
  const totalExpenses = closure.expenses.reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  )

  // L'incasso contanti per prima nota = vendite contanti + uscite pagate
  // Perché: se ho 550€ in cassa e ho pagato 37,90€ di uscite,
  // significa che l'incasso totale era 587,90€
  const cashIncome = totalCash + totalExpenses

  // 1. Movimento INCASSO su CASSA per totale incassi contanti (vendite + uscite)
  if (cashIncome > 0) {
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'CASH',
      description: generateClosureDescription('revenue', closure.date),
      debitAmount: cashIncome,
      creditAmount: null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += cashIncome
  }

  // 2. Movimenti USCITA su CASSA per ogni spesa
  for (const expense of closure.expenses) {
    if (expense.amount > 0) {
      entries.push({
        venueId: closure.venueId,
        date: closure.date,
        registerType: 'CASH',
        description: generateClosureDescription('expense', closure.date, {
          payee: expense.payee || undefined,
          description: expense.description || undefined,
          documentRef: expense.documentRef || undefined,
        }),
        documentRef: expense.documentRef,
        debitAmount: null,
        creditAmount: expense.amount,
        accountId: expense.accountId,
        closureId: closure.id,
        createdById: userId,
      })
      totalCredits += expense.amount
    }
  }

  // 3. Movimento INCASSO POS su BANCA (gli incassi POS arrivano direttamente in banca)
  if (totalPos > 0) {
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'BANK',
      description: generateClosureDescription('pos', closure.date),
      debitAmount: totalPos,
      creditAmount: null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += totalPos
  }

  // 4. Movimento VERSAMENTO se presente (coppia cassa → banca)
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
