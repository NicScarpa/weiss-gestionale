import { prisma } from '@/lib/prisma'
import {
  generateJournalEntriesFromClosure,
  deleteJournalEntriesForClosure,
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

/**
 * Approva o rifiuta una chiusura inviata.
 *
 * In approvazione, cambio di stato e generazione delle scritture avvengono
 * nella stessa transazione: se la generazione fallisce la chiusura non resta
 * validata a fronte di una prima nota vuota.
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

  if (closure.status !== 'SUBMITTED') {
    return { outcome: 'invalid_status', currentStatus: closure.status }
  }

  if (action === 'reject') {
    const { updated, deletedEntries } = await prisma.$transaction(async (tx) => {
      const deletedEntries = await deleteJournalEntriesForClosure(closureId, tx)

      const updated = await tx.dailyClosure.update({
        where: { id: closureId },
        data: {
          status: 'DRAFT',
          rejectionNotes: rejectionNotes || 'Chiusura rifiutata',
          submittedById: null,
          submittedAt: null,
        },
        select: { id: true, status: true, rejectionNotes: true },
      })

      return { updated, deletedEntries }
    })

    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'DailyClosure',
      entityId: closureId,
      newValues: { status: 'DRAFT', action: 'reject', rejectionNotes },
    })

    return { outcome: 'rejected', closure: updated, deletedJournalEntries: deletedEntries }
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

  const { updated, journalResult } = await prisma.$transaction(async (tx) => {
    const updated = await tx.dailyClosure.update({
      where: { id: closureId },
      data: {
        status: 'VALIDATED',
        validatedById: userId,
        validatedAt: new Date(),
        rejectionNotes: null,
      },
      select: { id: true, status: true, validatedAt: true },
    })

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

    return { updated, journalResult }
  })

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
    closure: updated,
    journalEntries: journalResult,
    budgetAlerts: alertsResult,
  }
}
