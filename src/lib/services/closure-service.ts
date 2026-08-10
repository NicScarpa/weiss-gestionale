import { prisma } from '@/lib/prisma'
import {
  generateJournalEntriesFromClosure,
  deleteJournalEntriesForClosure,
  JournalEntriesAlreadyExistError,
} from '@/lib/closure-journal-entries'
import { generateAlertsForVenue } from '@/lib/budget/alert-generator'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'

/**
 * Logica di validazione delle chiusure di cassa.
 *
 * Vive qui e non nella route perché è la parte contabile più delicata
 * dell'applicazione: approvare una chiusura genera le scritture di prima nota.
 * Estratta dalla route, è testabile senza passare da HTTP.
 */

/** Accetta sia i Decimal di Prisma sia numeri semplici (comodo nei test) */
type Amount = { toNumber(): number } | number | null

export interface ClosureStationAmounts {
  cashAmount: Amount
  floatAmount: Amount
}

export interface ClosureExpenseAmount {
  amount: Amount
}

/**
 * Versamento in banca calcolato dai dati della chiusura:
 * contanti incassati, meno i fondi cassa da lasciare, meno le uscite pagate
 * in contanti. Non può essere negativo.
 */
export function calculateBankDeposit(
  stations: ClosureStationAmounts[],
  expenses: ClosureExpenseAmount[]
): number {
  const toNumber = (v: Amount): number => {
    if (v === null || v === undefined) return 0
    const n = typeof v === 'number' ? v : v.toNumber()
    return Number.isFinite(n) ? n : 0
  }

  const cashTotal = stations.reduce((sum, s) => sum + toNumber(s.cashAmount), 0)
  const floatsTotal = stations.reduce((sum, s) => sum + toNumber(s.floatAmount), 0)
  const expensesTotal = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0)

  return Math.max(0, cashTotal - floatsTotal - expensesTotal)
}

export type ValidateClosureResult =
  | { outcome: 'not_found' }
  | { outcome: 'invalid_status'; currentStatus: string }
  | { outcome: 'missing_cost_center' }
  | { outcome: 'already_posted'; existingEntries: number }
  | {
      outcome: 'approved'
      closure: { id: string; status: string; validatedAt: Date | null }
      journalEntries: { entriesCreated: number; totalDebits: number; totalCredits: number }
      budgetAlerts: unknown
    }
  | {
      outcome: 'rejected'
      closure: { id: string; status: string; rejectionNotes: string | null }
      deletedJournalEntries: number
    }

interface ValidateClosureInput {
  closureId: string
  userId: string
  action: 'approve' | 'reject'
  rejectionNotes?: string
}

/** Quello che l'approvazione porta fuori dalla transazione. */
interface ApprovedTransaction {
  updated: { id: string; status: string; validatedAt: Date | null }
  journalResult: { entriesCreated: number; totalDebits: number; totalCredits: number }
}

/**
 * Perché la chiusura non è stata presa in carico.
 *
 * Ci si arriva quando l'aggiornamento condizionale non trova più una chiusura
 * INVIATA: nel frattempo qualcun altro l'ha validata, rifiutata o cancellata.
 * Lo stato si rilegge adesso, così il chiamante riceve la ragione vera e non
 * quella fotografata prima della corsa.
 */
async function outcomeAfterLostRace(closureId: string): Promise<ValidateClosureResult> {
  const closure = await prisma.dailyClosure.findUnique({
    where: { id: closureId },
    select: { status: true, deletedAt: true },
  })

  if (!closure || closure.deletedAt) {
    return { outcome: 'not_found' }
  }

  return { outcome: 'invalid_status', currentStatus: closure.status }
}

/**
 * Approva o rifiuta una chiusura inviata.
 *
 * Il passaggio di stato è un aggiornamento *condizionato* allo stato INVIATA,
 * eseguito dentro la transazione: è lui a decidere chi procede. Due validazioni
 * simultanee lo attraversano in fila (la seconda aspetta il commit della prima
 * sulla stessa riga) e solo una trova ancora la condizione vera; l'altra non
 * aggiorna nulla e si ferma. Un controllo letto prima della transazione, per
 * quanto corretto al momento della lettura, non può impedire nulla: fra la
 * lettura e la scrittura c'è tutto il tempo perché l'altra richiesta faccia il
 * suo lavoro, e il risultato erano due serie complete di scritture per lo stesso
 * giorno.
 *
 * In approvazione, cambio di stato e generazione delle scritture restano nella
 * stessa transazione: se la generazione fallisce la chiusura non resta validata
 * a fronte di una prima nota vuota.
 */
export async function validateClosure({
  closureId,
  userId,
  action,
  rejectionNotes,
}: ValidateClosureInput): Promise<ValidateClosureResult> {
  const closure = await prisma.dailyClosure.findUnique({
    where: { id: closureId },
    include: {
      stations: { include: { cashCount: true } },
      expenses: true,
      venue: { select: { id: true, name: true, vatRate: true } },
    },
  })

  if (!closure) {
    return { outcome: 'not_found' }
  }

  // Controllo anticipato: risparmia il lavoro inutile nel caso normale. Non è
  // lui a garantire l'unicità — quella la fa l'updateMany qui sotto.
  if (closure.status !== 'SUBMITTED') {
    return { outcome: 'invalid_status', currentStatus: closure.status }
  }

  if (action === 'reject') {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.dailyClosure.updateMany({
        where: { id: closureId, status: 'SUBMITTED', deletedAt: null },
        data: {
          status: 'DRAFT',
          rejectionNotes: rejectionNotes || 'Chiusura rifiutata',
          submittedById: null,
          submittedAt: null,
        },
      })

      if (claimed.count === 0) return null

      const deletedEntries = await deleteJournalEntriesForClosure(closureId, tx)

      const updated = await tx.dailyClosure.findUniqueOrThrow({
        where: { id: closureId },
        select: { id: true, status: true, rejectionNotes: true },
      })

      return { updated, deletedEntries }
    })

    if (!result) {
      return outcomeAfterLostRace(closureId)
    }

    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'DailyClosure',
      entityId: closureId,
      newValues: { status: 'DRAFT', action: 'reject', rejectionNotes },
    })

    return {
      outcome: 'rejected',
      closure: result.updated,
      deletedJournalEntries: result.deletedEntries,
    }
  }

  // Il centro di costo resta opzionale nello zod di creazione/modifica (bozze
  // storiche, salvataggi incrementali della PWA): il vincolo si applica solo
  // qui, all'ultimo punto prima che i movimenti nascano. Senza questo
  // controllo, approvare una chiusura con testata vuota farebbe ricadere in
  // silenzio tutti i movimenti generati sul centro di default del server
  // (STR) invece che su quello scelto dal compilatore. Non blocca il
  // rifiuto: una chiusura senza centro deve poter tornare in bozza per
  // essere corretta.
  if (!closure.costCenterId) {
    return { outcome: 'missing_cost_center' }
  }

  const bankDeposit = calculateBankDeposit(closure.stations, closure.expenses)

  // `null` quando la corsa è stata persa: la transazione non ha aggiornato nulla
  let result: ApprovedTransaction | null

  try {
    result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.dailyClosure.updateMany({
        where: { id: closureId, status: 'SUBMITTED', deletedAt: null },
        data: {
          status: 'VALIDATED',
          validatedById: userId,
          validatedAt: new Date(),
          rejectionNotes: null,
        },
      })

      if (claimed.count === 0) return null

      const journalResult = await generateJournalEntriesFromClosure(
        {
          id: closure.id,
          date: closure.date,
          venueId: closure.venueId,
          bankDeposit,
          // Imputazione: il centro della testata vale per tutti i movimenti
          // generati, salvo la riga spesa che ne indica uno proprio.
          costCenterId: closure.costCenterId,
          stations: closure.stations.map((s) => ({
            cashAmount: s.cashAmount ? Number(s.cashAmount) : null,
            posAmount: s.posAmount ? Number(s.posAmount) : null,
            floatAmount: s.floatAmount ? Number(s.floatAmount) : null,
          })),
          expenses: closure.expenses.map((e) => ({
            amount: Number(e.amount),
            payee: e.payee,
            description: e.description,
            documentRef: e.documentRef,
            accountId: e.accountId,
            costCenterId: e.costCenterId,
          })),
        },
        userId,
        tx
      )

      const updated = await tx.dailyClosure.findUniqueOrThrow({
        where: { id: closureId },
        select: { id: true, status: true, validatedAt: true },
      })

      return { updated, journalResult }
    })
  } catch (error) {
    // La chiusura aveva già le sue scritture: la transazione si è annullata da
    // sola, quindi non è rimasta validata. Non è un errore del server, è uno
    // stato che il chiamante deve poter distinguere.
    if (error instanceof JournalEntriesAlreadyExistError) {
      return { outcome: 'already_posted', existingEntries: error.existingEntries }
    }
    throw error
  }

  if (!result) {
    return outcomeAfterLostRace(closureId)
  }

  // Gli alert budget sono informativi: un errore qui non invalida la chiusura
  let alertsResult: unknown = null
  try {
    alertsResult = await generateAlertsForVenue(closure.venueId)
  } catch (alertError) {
    logger.error('Errore generazione alert budget', alertError)
  }

  await createAuditLog({
    userId,
    action: 'UPDATE',
    entityType: 'DailyClosure',
    entityId: closureId,
    newValues: { status: 'VALIDATED', action: 'approve' },
  })

  return {
    outcome: 'approved',
    closure: result.updated,
    journalEntries: result.journalResult,
    budgetAlerts: alertsResult,
  }
}
