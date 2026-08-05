import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'

/**
 * Riconciliazione fra movimenti di prima nota e scadenze.
 *
 * Il ciclo che questo modulo chiude: la fattura genera la scadenza, il denaro
 * si muove e produce un movimento, la riconciliazione li unisce e la scadenza
 * si salda. Senza questo passaggio scadenzario e contabilità restano due
 * racconti separati della stessa realtà.
 *
 * Due scelte prese dal modello Sibill:
 * - il rifiuto di una proposta **crea** un record REJECTED invece di
 *   cancellare, così resta traccia di cosa il sistema aveva proposto;
 * - le proposte di match non si persistono, si ricalcolano quando servono.
 *
 * Una divergenza deliberata: sulle riconciliazioni parziali Sibill riscrive lo
 * scadenzario generando una nuova scadenza per il residuo, mentre qui si
 * mantiene `importoPagato`, che il gestionale già gestisce con i pagamenti
 * parziali e la relativa interfaccia.
 */

export type ReconcileOutcome =
  | { outcome: 'ok'; reconciliationId: string; scheduleStato: string; importoPagato: number }
  | { outcome: 'schedule_not_found' }
  | { outcome: 'entry_not_found' }
  | { outcome: 'already_reconciled' }
  | { outcome: 'schedule_closed'; stato: string }
  | { outcome: 'invalid_amount'; motivo: string }

interface ReconcileInput {
  scheduleId: string
  journalEntryId: string
  venueId: string
  userId: string | null
  /** Quota imputata alla scadenza: se assente si usa il residuo o l'importo del movimento */
  amount?: number
  source?: 'MANUAL' | 'AUTOMATIC' | 'PROPOSAL' | 'RULE'
  confidence?: number
}

/** Importo del movimento nel verso che salda la scadenza. */
function importoUtile(
  entry: { debitAmount: Prisma.Decimal | null; creditAmount: Prisma.Decimal | null },
  tipo: string
): number {
  const entrata = entry.debitAmount ? Number(entry.debitAmount) : 0
  const uscita = entry.creditAmount ? Number(entry.creditAmount) : 0
  return tipo === 'attiva' ? entrata : uscita
}

/**
 * Collega un movimento a una scadenza e aggiorna lo stato di quest'ultima.
 * Tutto in transazione: non deve esistere una riconciliazione senza il
 * pagamento corrispondente, né viceversa.
 */
export async function reconcileScheduleWithEntry({
  scheduleId,
  journalEntryId,
  venueId,
  userId,
  amount,
  source = 'MANUAL',
  confidence,
}: ReconcileInput): Promise<ReconcileOutcome> {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, venueId },
    select: {
      id: true,
      tipo: true,
      stato: true,
      importoTotale: true,
      importoPagato: true,
      dataPagamento: true,
      invoiceId: true,
    },
  })

  if (!schedule) return { outcome: 'schedule_not_found' }

  if (schedule.stato === 'pagata' || schedule.stato === 'annullata') {
    return { outcome: 'schedule_closed', stato: schedule.stato }
  }

  const entry = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, venueId },
    select: { id: true, date: true, debitAmount: true, creditAmount: true, description: true },
  })

  if (!entry) return { outcome: 'entry_not_found' }

  const esistente = await prisma.scheduleReconciliation.findFirst({
    where: { scheduleId, journalEntryId, status: 'VERIFIED' },
    select: { id: true },
  })

  if (esistente) return { outcome: 'already_reconciled' }

  const residuo = Number(schedule.importoTotale) - Number(schedule.importoPagato)
  const disponibile = importoUtile(entry, schedule.tipo)

  if (disponibile <= 0) {
    return {
      outcome: 'invalid_amount',
      motivo:
        schedule.tipo === 'attiva'
          ? 'Il movimento non è un incasso: non può saldare una scadenza attiva'
          : 'Il movimento non è un\'uscita: non può saldare una scadenza passiva',
    }
  }

  // Senza indicazione esplicita si imputa il minore fra residuo e movimento:
  // un bonifico cumulativo copre la scadenza fino a concorrenza
  const quota = amount ?? Math.min(residuo, disponibile)

  if (quota <= 0) {
    return { outcome: 'invalid_amount', motivo: 'La quota da imputare deve essere positiva' }
  }
  if (quota > residuo + 0.01) {
    return {
      outcome: 'invalid_amount',
      motivo: `La quota supera il residuo della scadenza (${residuo.toFixed(2)} €)`,
    }
  }

  const risultato = await prisma.$transaction(async (tx) => {
    const payment = await tx.schedulePayment.create({
      data: {
        scheduleId,
        importo: new Prisma.Decimal(quota.toFixed(2)),
        dataPagamento: entry.date,
        note: `Riconciliato con il movimento: ${entry.description}`,
      },
    })

    const reconciliation = await tx.scheduleReconciliation.create({
      data: {
        scheduleId,
        journalEntryId,
        status: 'VERIFIED',
        source,
        amount: new Prisma.Decimal(quota.toFixed(2)),
        confidence: confidence !== undefined ? new Prisma.Decimal(confidence.toFixed(2)) : null,
        paymentId: payment.id,
        createdById: userId,
      },
    })

    const nuovoPagato = Number(schedule.importoPagato) + quota
    const saldata = nuovoPagato >= Number(schedule.importoTotale) - 0.01
    const nuovoStato = saldata ? 'pagata' : 'parzialmente_pagata'

    await tx.schedule.update({
      where: { id: scheduleId },
      data: {
        importoPagato: new Prisma.Decimal(nuovoPagato.toFixed(2)),
        stato: nuovoStato,
        // La data di pagamento è quella del movimento reale, non di oggi
        ...(saldata && !schedule.dataPagamento ? { dataPagamento: entry.date } : {}),
        // La data attesa di cassa si riallinea al movimento reale, come
        // l'expectedPaymentDate di Sibill. Solo a saldo completo: su un
        // acconto il residuo resta atteso alla data contrattuale
        ...(saldata ? { dataAttesa: entry.date } : {}),
      },
    })

    return { reconciliation, nuovoStato, nuovoPagato, saldata }
  })

  // La fattura risulta pagata solo quando tutte le sue rate lo sono
  if (schedule.invoiceId && risultato.saldata) {
    const rateAperte = await prisma.schedule.count({
      where: { invoiceId: schedule.invoiceId, stato: { not: 'pagata' } },
    })

    if (rateAperte === 0) {
      await prisma.electronicInvoice.update({
        where: { id: schedule.invoiceId },
        data: { status: 'PAID' },
      })
    }
  }

  logger.info('Scadenza riconciliata con movimento', {
    scheduleId,
    journalEntryId,
    quota,
    stato: risultato.nuovoStato,
    source,
  })

  return {
    outcome: 'ok',
    reconciliationId: risultato.reconciliation.id,
    scheduleStato: risultato.nuovoStato,
    importoPagato: risultato.nuovoPagato,
  }
}

/**
 * Registra il rifiuto di una proposta di match.
 * Non cancella nulla: il record REJECTED è la memoria di ciò che il sistema
 * aveva proposto e l'utente ha scartato, così non lo si ripropone all'infinito.
 */
export async function rejectScheduleMatch({
  scheduleId,
  journalEntryId,
  venueId,
  userId,
  amount = 0,
}: {
  scheduleId: string
  journalEntryId: string
  venueId: string
  userId: string | null
  amount?: number
}): Promise<{ outcome: 'ok'; reconciliationId: string } | { outcome: 'schedule_not_found' }> {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, venueId },
    select: { id: true },
  })

  if (!schedule) return { outcome: 'schedule_not_found' }

  const reconciliation = await prisma.scheduleReconciliation.create({
    data: {
      scheduleId,
      journalEntryId,
      status: 'REJECTED',
      source: 'PROPOSAL',
      amount: new Prisma.Decimal(amount.toFixed(2)),
      createdById: userId,
    },
  })

  return { outcome: 'ok', reconciliationId: reconciliation.id }
}

/**
 * Annulla una riconciliazione: rimuove il pagamento generato e riporta la
 * scadenza allo stato precedente. Serve quando il match si rivela sbagliato.
 */
export async function undoScheduleReconciliation({
  reconciliationId,
  venueId,
}: {
  reconciliationId: string
  venueId: string
}): Promise<{ outcome: 'ok'; scheduleStato: string } | { outcome: 'not_found' }> {
  const reconciliation = await prisma.scheduleReconciliation.findFirst({
    where: { id: reconciliationId, status: 'VERIFIED', schedule: { venueId } },
    select: {
      id: true,
      scheduleId: true,
      paymentId: true,
      amount: true,
      schedule: { select: { importoTotale: true, importoPagato: true } },
    },
  })

  if (!reconciliation) return { outcome: 'not_found' }

  const nuovoPagato = Math.max(
    0,
    Number(reconciliation.schedule.importoPagato) - Number(reconciliation.amount)
  )
  const nuovoStato = nuovoPagato <= 0.01 ? 'aperta' : 'parzialmente_pagata'

  await prisma.$transaction(async (tx) => {
    await tx.scheduleReconciliation.delete({ where: { id: reconciliationId } })

    if (reconciliation.paymentId) {
      await tx.schedulePayment.delete({ where: { id: reconciliation.paymentId } })
    }

    await tx.schedule.update({
      where: { id: reconciliation.scheduleId },
      data: {
        importoPagato: new Prisma.Decimal(nuovoPagato.toFixed(2)),
        stato: nuovoStato,
        // La scadenza non è più saldata: la data di pagamento non ha più senso
        // e la data attesa torna a seguire quella contrattuale (null = coincide)
        dataPagamento: null,
        dataAttesa: null,
      },
    })
  })

  return { outcome: 'ok', scheduleStato: nuovoStato }
}
