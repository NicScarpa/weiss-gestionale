// Algoritmo di matching per riconciliazione bancaria

import { prisma } from '@/lib/prisma'
import { MATCH_THRESHOLDS, MATCH_WEIGHTS } from '@/types/reconciliation'
import type { ReconciliationStatus, MatchCandidate, ReconcileResult } from '@/types/reconciliation'
import { ricalcolaResiduoDocumenti } from '@/lib/banca/residuo-documenti'
import { numeroDistintaNellaCausale } from './numero-distinta'

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
export function stringSimilarity(str1: string, str2: string): number {
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
export function daysDifference(date1: Date, date2: Date): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  d1.setHours(0, 0, 0, 0)
  d2.setHours(0, 0, 0, 0)
  const diffTime = Math.abs(d2.getTime() - d1.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Calcola il confidence score per un match tra transazione bancaria e movimento
 * prima nota.
 *
 * Da qui in giù — punteggio, ricerca dei candidati, soglia di stato — è tutto
 * materiale interno di `reconcileVenueTransactions`: non è più esportato perché
 * dopo la coda assistita nessuno fuori di qui ha ragione di chiamarlo, e un
 * export senza chiamanti è un invito a costruirci sopra.
 */
function calculateMatchScore(bankTx: BankTx, entry: JournalEntry): number {
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

  // Bonus: se il documento di riferimento è presente nella descrizione banca.
  // Entrambi i lati si normalizzano togliendo la punteggiatura (uno '88-4213'
  // deve trovare '88-4213' anche se la causale scrive '884213' o viceversa),
  // e la guardia sulla lunghezza evita che un documentRef di una cifra
  // matcherebbe quasi ogni causale — vedi lo stesso schema in
  // schedule-matcher.ts.
  if (numeroDistintaNellaCausale(entry.documentRef, bankTx.description)) {
    score = Math.min(1, score + MATCH_WEIGHTS.DOCUMENTO)
  }

  return Math.round(score * 100) / 100 // Arrotonda a 2 decimali
}

/**
 * Trova i migliori candidati per il match di una transazione bancaria
 */
async function findMatchCandidates(
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
function getReconciliationStatus(confidence: number): ReconciliationStatus {
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

    // L'aggancio a una scrittura esistente porta con sé il residuo dei suoi
    // documenti sulla riga: senza, la legenda direbbe «abbinato» anche dove
    // la scrittura copre solo una parte.
    if (matchedEntryId) await ricalcolaResiduoDocumenti(prisma, matchedEntryId)

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


