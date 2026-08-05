import { describe, it, expect, vi, beforeEach } from 'vitest'

// Il service è tutto accesso al database: si mocka prisma e si osserva cosa
// scrive. $transaction esegue la callback passando il mock stesso come tx.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    journalEntry: { findFirst: vi.fn() },
    scheduleReconciliation: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    schedulePayment: { create: vi.fn(), delete: vi.fn() },
    electronicInvoice: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({
  applicaStimaSuScadenza: vi.fn(),
  ricalcolaStimeFornitore: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import {
  reconcileScheduleWithEntry,
  undoScheduleReconciliation,
} from '../schedule-reconciliation-service'

const VENUE = 'venue-1'

function scadenza(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    tipo: 'passiva',
    stato: 'aperta',
    importoTotale: new Prisma.Decimal(100),
    importoPagato: new Prisma.Decimal(0),
    dataPagamento: null,
    invoiceId: null,
    supplierId: 'sup-1',
    dataScadenza: new Date('2026-07-20'),
    ...overrides,
  }
}

function movimento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    date: new Date('2026-07-30'),
    debitAmount: null,
    creditAmount: new Prisma.Decimal(100),
    description: 'Bonifico fornitore',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(
    async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma)
  )
  vi.mocked(prisma.schedulePayment.create).mockResolvedValue(
    { id: 'pay-1' } as never
  )
  vi.mocked(prisma.scheduleReconciliation.create).mockResolvedValue(
    { id: 'rec-1' } as never
  )
  vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(null)
})

describe('reconcileScheduleWithEntry - dataAttesa', () => {
  it('riallinea dataAttesa alla data del movimento quando la riconciliazione salda la scadenza', async () => {
    const entry = movimento()
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(entry as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stato: 'pagata',
          dataAttesa: entry.date,
        }),
      })
    )
  })

  it('non tocca dataAttesa su una riconciliazione parziale', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(40) }) as never
    )

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    const update = vi.mocked(prisma.schedule.update).mock.calls[0][0]
    expect(update.data.stato).toBe('parzialmente_pagata')
    expect(update.data).not.toHaveProperty('dataAttesa')
  })
})

describe('undoScheduleReconciliation - dataAttesa', () => {
  it('riporta dataAttesa a null: la scadenza torna a seguire la data contrattuale', async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
      },
    } as never)

    const esito = await undoScheduleReconciliation({
      reconciliationId: 'rec-1',
      venueId: VENUE,
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataPagamento: null,
          dataAttesa: null,
        }),
      })
    )
  })
})

describe('reconcileScheduleWithEntry - provenienza e ricalcolo', () => {
  it('al saldo la source diventa riconciliazione e si ricalcolano le stime del fornitore', async () => {
    const entry = movimento()
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(entry as never)

    await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataAttesa: entry.date,
          dataAttesaSource: 'riconciliazione',
        }),
      })
    )
    expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', VENUE)
  })

  it('su un acconto parziale non si ricalcola nulla', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(40) }) as never
    )

    await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
  })

  it("l'undo azzera la data attesa e poi la ristima", async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
      },
    } as never)

    await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dataAttesa: null, dataAttesaSource: null }),
      })
    )
    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', VENUE)
  })

  it("l'undo toglie un'osservazione dalla storia: ricalcola anche le altre scadenze del fornitore", async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
        tipo: 'passiva',
        supplierId: 'sup-1',
      },
    } as never)

    await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', VENUE)
  })

  it("l'undo su una scadenza senza fornitore non ricalcola nulla", async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
        tipo: 'passiva',
        supplierId: null,
      },
    } as never)

    await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', VENUE)
  })
})
