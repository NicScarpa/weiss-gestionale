// Algoritmo di matching per riconciliazione bancaria

import { prisma } from '@/lib/prisma'
import { MATCH_THRESHOLDS, MATCH_WEIGHTS } from '@/types/reconciliation'
import type { ReconciliationStatus, MatchCandidate, ReconcileResult } from '@/types/reconciliation'

interface BankTx {
  id: string
  transactionDate: Date
  description: string
  amount: number
}

interface JournalEntry {
  id: string
  date: Date
  description: string
  debitAmount: number | null
  creditAmount: number | null
  documentRef: string | null
}

/**
 * Calcola la similarità tra due stringhe usando Levenshtein distance
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  // Controlla se una stringa contiene l'altra
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8
  }

  // Calcola Levenshtein distance
  const matrix: number[][] = []

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  const maxLen = Math.max(s1.length, s2.length)
  const distance = matrix[s1.length][s2.length]

  return 1 - distance / maxLen
}

/**
 * Calcola i giorni di differenza tra due date
 */
function daysDifference(date1: Date, date2: Date): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  d1.setHours(0, 0, 0, 0)
  d2.setHours(0, 0, 0, 0)
  const diffTime = Math.abs(d2.getTime() - d1.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Calcola il confidence score per un match tra transazione bancaria e movimento prima nota
 */
export function calculateMatchScore(bankTx: BankTx, entry: JournalEntry): number {
  let score = 0

  // 1. Match importo (40% peso)
  const bankAmount = Math.abs(bankTx.amount)
  const entryAmount = Math.abs(
    bankTx.amount > 0
      ? Number(entry.debitAmount) || 0
      : Number(entry.creditAmount) || 0
  )

  if (bankAmount === entryAmount) {
    score += MATCH_WEIGHTS.AMOUNT
  } else {
    // Tolleranza per differenze di arrotondamento (max 1 centesimo)
    const amountDiff = Math.abs(bankAmount - entryAmount)
    if (amountDiff <= 0.01) {
      score += MATCH_WEIGHTS.AMOUNT * 0.95
    } else if (amountDiff <= 1) {
      score += MATCH_WEIGHTS.AMOUNT * 0.5
    }
  }

  // 2. Match data (30% peso)
  const daysDiff = daysDifference(bankTx.transactionDate, entry.date)

  if (daysDiff === 0) {
    score += MATCH_WEIGHTS.DATE
  } else if (daysDiff === 1) {
    score += MATCH_WEIGHTS.DATE * 0.8
  } else if (daysDiff === 2) {
    score += MATCH_WEIGHTS.DATE * 0.5
  } else if (daysDiff <= 5) {
    score += MATCH_WEIGHTS.DATE * 0.2
  }

  // 3. Similarità descrizione (30% peso)
  const descSimilarity = stringSimilarity(bankTx.description, entry.description)
  score += MATCH_WEIGHTS.DESCRIPTION * descSimilarity

  // Bonus: se il documento di riferimento è presente nella descrizione banca
  if (entry.documentRef) {
    const refInDesc = bankTx.description.toLowerCase().includes(
      entry.documentRef.toLowerCase().replace(/[^a-z0-9]/gi, '')
    )
    if (refInDesc) {
      score = Math.min(1, score + 0.1) // Bonus 10%
    }
  }

  return Math.round(score * 100) / 100 // Arrotonda a 2 decimali
}

/**
 * Trova i migliori candidati per il match di una transazione bancaria
 */
export async function findMatchCandidates(
  bankTransaction: BankTx,
  venueId: string,
  limit: number = 5
): Promise<MatchCandidate[]> {
  // Cerca movimenti prima nota nella finestra temporale
  const dateWindow = 7 // ±7 giorni
  const startDate = new Date(bankTransaction.transactionDate)
  startDate.setDate(startDate.getDate() - dateWindow)
  const endDate = new Date(bankTransaction.transactionDate)
  endDate.setDate(endDate.getDate() + dateWindow)

  // Query movimenti BANCA non ancora riconciliati
  const entries = await prisma.journalEntry.findMany({
    where: {
      venueId,
      registerType: 'BANK',
      date: {
        gte: startDate,
        lte: endDate,
      },
      // Escludi movimenti già riconciliati
      bankTransaction: null,
    },
    select: {
      id: true,
      date: true,
      description: true,
      debitAmount: true,
      creditAmount: true,
      documentRef: true,
    },
  })

  // Calcola score per ogni movimento
  const candidates = entries.map((entry) => {
    const confidence = calculateMatchScore(bankTransaction, {
      id: entry.id,
      date: entry.date,
      description: entry.description,
      debitAmount: entry.debitAmount ? Number(entry.debitAmount) : null,
      creditAmount: entry.creditAmount ? Number(entry.creditAmount) : null,
      documentRef: entry.documentRef,
    })

    const amount =
      bankTransaction.amount > 0
        ? Number(entry.debitAmount) || 0
        : Number(entry.creditAmount) || 0

    return {
      journalEntryId: entry.id,
      date: entry.date,
      description: entry.description,
      amount,
      documentRef: entry.documentRef,
      confidence,
    }
  })

  // Ordina per confidence decrescente e limita
  return candidates
    .filter((c) => c.confidence > 0.3) // Escludi match molto bassi
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}

/**
 * Determina lo status di riconciliazione basato sul confidence score
 */
export function getReconciliationStatus(confidence: number): ReconciliationStatus {
  if (confidence >= MATCH_THRESHOLDS.AUTO_MATCH) {
    return 'MATCHED'
  } else if (confidence >= MATCH_THRESHOLDS.REVIEW) {
    return 'TO_REVIEW'
  } else {
    return 'UNMATCHED'
  }
}

/**
 * Esegue la riconciliazione automatica per tutte le transazioni pending di una venue
 */
export async function reconcileVenueTransactions(
  venueId: string,
  options?: {
    dateFrom?: Date
    dateTo?: Date
    autoMatchOnly?: boolean // Se true, matcha solo quelli con confidence >= 90%
  }
): Promise<ReconcileResult> {
  const { dateFrom, dateTo, autoMatchOnly = false } = options || {}

  // Trova transazioni bancarie pending
  const whereClause: Record<string, unknown> = {
    venueId,
    status: 'PENDING',
  }

  if (dateFrom || dateTo) {
    whereClause.transactionDate = {}
    if (dateFrom) (whereClause.transactionDate as Record<string, Date>).gte = dateFrom
    if (dateTo) (whereClause.transactionDate as Record<string, Date>).lte = dateTo
  }

  const pendingTransactions = await prisma.bankTransaction.findMany({
    where: whereClause,
    orderBy: { transactionDate: 'asc' },
  })

  const results: ReconcileResult = {
    matched: 0,
    toReview: 0,
    unmatched: 0,
    transactions: [],
  }

  for (const tx of pendingTransactions) {
    const candidates = await findMatchCandidates(
      {
        id: tx.id,
        transactionDate: tx.transactionDate,
        description: tx.description,
        amount: Number(tx.amount),
      },
      venueId
    )

    const bestMatch = candidates[0]
    let newStatus: ReconciliationStatus = 'UNMATCHED'
    let matchedEntryId: string | null = null
    let matchConfidence: number | null = null

    if (bestMatch) {
      newStatus = getReconciliationStatus(bestMatch.confidence)
      matchConfidence = bestMatch.confidence

      // Se autoMatchOnly, matcha solo quelli con alta confidenza
      if (autoMatchOnly && newStatus !== 'MATCHED') {
        newStatus = 'UNMATCHED'
      } else if (newStatus === 'MATCHED' || newStatus === 'TO_REVIEW') {
        matchedEntryId = bestMatch.journalEntryId
      }
    }

    // Aggiorna la transazione
    await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        status: newStatus,
        matchedEntryId,
        matchConfidence,
      },
    })

    // Aggiorna contatori
    if (newStatus === 'MATCHED') results.matched++
    else if (newStatus === 'TO_REVIEW') results.toReview++
    else results.unmatched++

    results.transactions.push({
      id: tx.id,
      status: newStatus,
      matchedEntryId,
      matchConfidence,
    })
  }

  return results
}

/**
 * Conferma un match suggerito (cambia status da TO_REVIEW a MATCHED)
 */
export async function confirmMatch(
  transactionId: string,
  userId: string
): Promise<void> {
  const tx = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
  })

  if (!tx) {
    throw new Error('Transazione non trovata')
  }

  if (tx.status !== 'TO_REVIEW' && tx.status !== 'PENDING') {
    throw new Error('Solo transazioni in revisione possono essere confermate')
  }

  if (!tx.matchedEntryId) {
    throw new Error('Nessun match da confermare')
  }

  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'MATCHED',
      reconciledBy: userId,
      reconciledAt: new Date(),
    },
  })
}

/**
 * Esegue un match manuale tra transazione e movimento
 */
export async function manualMatch(
  transactionId: string,
  journalEntryId: string,
  userId: string
): Promise<void> {
  // Verifica che il movimento non sia già matchato
  const existingMatch = await prisma.bankTransaction.findFirst({
    where: {
      matchedEntryId: journalEntryId,
      id: { not: transactionId },
    },
  })

  if (existingMatch) {
    throw new Error('Questo movimento è già associato a un\'altra transazione')
  }

  // Calcola confidence per il match manuale
  const [tx, entry] = await Promise.all([
    prisma.bankTransaction.findUnique({ where: { id: transactionId } }),
    prisma.journalEntry.findUnique({ where: { id: journalEntryId } }),
  ])

  if (!tx || !entry) {
    throw new Error('Transazione o movimento non trovato')
  }

  const confidence = calculateMatchScore(
    {
      id: tx.id,
      transactionDate: tx.transactionDate,
      description: tx.description,
      amount: Number(tx.amount),
    },
    {
      id: entry.id,
      date: entry.date,
      description: entry.description,
      debitAmount: entry.debitAmount ? Number(entry.debitAmount) : null,
      creditAmount: entry.creditAmount ? Number(entry.creditAmount) : null,
      documentRef: entry.documentRef,
    }
  )

  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'MANUAL',
      matchedEntryId: journalEntryId,
      matchConfidence: confidence,
      reconciledBy: userId,
      reconciledAt: new Date(),
    },
  })
}

/**
 * Ignora una transazione (non richiede match)
 */
export async function ignoreTransaction(
  transactionId: string,
  userId: string
): Promise<void> {
  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'IGNORED',
      matchedEntryId: null,
      matchConfidence: null,
      reconciledBy: userId,
      reconciledAt: new Date(),
    },
  })
}

/**
 * Annulla un match (torna a PENDING)
 */
export async function unmatch(transactionId: string): Promise<void> {
  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'PENDING',
      matchedEntryId: null,
      matchConfidence: null,
      reconciledBy: null,
      reconciledAt: null,
    },
  })
}
