import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  generateSchedulesFromInvoice,
  checkInvoiceDeletable,
  softDeleteSchedulesForInvoice,
} from '../invoice-schedule-service'

const baseInvoice = {
  id: 'inv-1',
  venueId: 'venue-1',
  invoiceNumber: '2026/123',
  invoiceDate: new Date('2026-08-01'),
  documentType: 'TD01',
  supplierId: 'sup-1',
  supplierName: 'Fornitore Bevande SRL',
}

function deadline(id: string, amount: number, dueDate: string, paymentMethod = 'MP05') {
  return { id, amount: new Prisma.Decimal(amount), dueDate: new Date(dueDate), paymentMethod }
}

describe('generateSchedulesFromInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([])
    vi.mocked(prisma.schedule.create).mockResolvedValue({} as never)
  })

  it('crea una scadenza per ogni rata della fattura', async () => {
    const result = await generateSchedulesFromInvoice(
      {
        ...baseInvoice,
        deadlines: [
          deadline('dl-1', 1000, '2026-09-30'),
          deadline('dl-2', 1000, '2026-10-31'),
        ],
      },
      'user-1'
    )

    expect(result).toEqual({ created: 2, skipped: 0 })
    expect(prisma.schedule.create).toHaveBeenCalledTimes(2)
  })

  it('collega ogni scadenza alla fattura e alla rata di origine', async () => {
    await generateSchedulesFromInvoice(
      { ...baseInvoice, deadlines: [deadline('dl-1', 500, '2026-09-30')] },
      'user-1'
    )

    expect(prisma.schedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 'inv-1',
          invoiceDeadlineId: 'dl-1',
          source: 'import_fatture_sdi',
          supplierId: 'sup-1',
          numeroDocumento: '2026/123',
        }),
      })
    )
  })

  it('una fattura di acquisto genera una scadenza passiva', async () => {
    await generateSchedulesFromInvoice(
      { ...baseInvoice, deadlines: [deadline('dl-1', 500, '2026-09-30')] },
      'user-1'
    )

    expect(prisma.schedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'passiva' }) })
    )
  })

  it.each(['TD24', 'TD25'])(
    'tratta la fattura differita %s come passiva, non come credito',
    async (documentType) => {
      // TD24/TD25 sono fatture differite ex art. 21 c. 4: il documento del
      // fornitore che consegna con DDT e fattura a fine mese, quindi ricevute
      await generateSchedulesFromInvoice(
        { ...baseInvoice, documentType, deadlines: [deadline('dl-1', 500, '2026-09-30')] },
        'user-1'
      )

      expect(prisma.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'passiva' }) })
      )
    }
  )

  it.each(['TD04', 'TD05'])(
    'non genera scadenze per il documento di rettifica %s',
    async (documentType) => {
      // Una nota di credito riduce il debito verso il fornitore: generare una
      // scadenza da pagare lo aumenterebbe
      const result = await generateSchedulesFromInvoice(
        { ...baseInvoice, documentType, deadlines: [deadline('dl-1', 500, '2026-09-30')] },
        'user-1'
      )

      expect(result.created).toBe(0)
      expect(prisma.schedule.create).not.toHaveBeenCalled()
    }
  )

  it('numera le rate nella descrizione quando sono più di una', async () => {
    await generateSchedulesFromInvoice(
      {
        ...baseInvoice,
        deadlines: [
          deadline('dl-1', 500, '2026-09-30'),
          deadline('dl-2', 500, '2026-10-31'),
        ],
      },
      'user-1'
    )

    const descrizioni = vi
      .mocked(prisma.schedule.create)
      .mock.calls.map((call) => (call[0] as { data: { descrizione: string } }).data.descrizione)

    expect(descrizioni[0]).toContain('rata 1/2')
    expect(descrizioni[1]).toContain('rata 2/2')
  })

  it('non numera la rata quando la fattura ha un solo pagamento', async () => {
    await generateSchedulesFromInvoice(
      { ...baseInvoice, deadlines: [deadline('dl-1', 500, '2026-09-30')] },
      'user-1'
    )

    const { data } = vi.mocked(prisma.schedule.create).mock.calls[0][0] as {
      data: { descrizione: string }
    }
    expect(data.descrizione).not.toContain('rata')
  })

  it('salta le rate che hanno già una scadenza (nessun doppione)', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { invoiceDeadlineId: 'dl-1' },
    ] as never)

    const result = await generateSchedulesFromInvoice(
      {
        ...baseInvoice,
        deadlines: [
          deadline('dl-1', 500, '2026-09-30'),
          deadline('dl-2', 500, '2026-10-31'),
        ],
      },
      'user-1'
    )

    expect(result).toEqual({ created: 1, skipped: 1 })
    expect(prisma.schedule.create).toHaveBeenCalledTimes(1)
  })

  it('non crea nulla se tutte le rate sono già state importate', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { invoiceDeadlineId: 'dl-1' },
    ] as never)

    const result = await generateSchedulesFromInvoice(
      { ...baseInvoice, deadlines: [deadline('dl-1', 500, '2026-09-30')] },
      'user-1'
    )

    expect(result).toEqual({ created: 0, skipped: 1 })
    expect(prisma.schedule.create).not.toHaveBeenCalled()
  })

  it('gestisce una fattura senza rate', async () => {
    const result = await generateSchedulesFromInvoice(
      { ...baseInvoice, deadlines: [] },
      'user-1'
    )

    expect(result).toEqual({ created: 0, skipped: 0 })
    expect(prisma.schedule.create).not.toHaveBeenCalled()
  })

  it('traduce il metodo di pagamento dal codice FatturaPA', async () => {
    await generateSchedulesFromInvoice(
      { ...baseInvoice, deadlines: [deadline('dl-1', 500, '2026-09-30', 'MP12')] },
      'user-1'
    )

    expect(prisma.schedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ metodoPagamento: 'riba' }) })
    )
  })

  it('riporta sulla scadenza la nota quando la data è stimata', async () => {
    // Una data stimata deve essere riconoscibile, altrimenti sembra un termine
    // dichiarato dal fornitore
    await generateSchedulesFromInvoice(
      {
        ...baseInvoice,
        deadlines: [
          {
            ...deadline('dl-1', 500, '2026-08-31'),
            notaStima: 'Scadenza stimata a 30 giorni dalla data fattura',
          },
        ],
      },
      'user-1'
    )

    expect(prisma.schedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note: 'Scadenza stimata a 30 giorni dalla data fattura',
        }),
      })
    )
  })

  it('non scrive note quando la data viene dal documento', async () => {
    await generateSchedulesFromInvoice(
      { ...baseInvoice, deadlines: [deadline('dl-1', 500, '2026-09-30')] },
      'user-1'
    )

    const { data } = vi.mocked(prisma.schedule.create).mock.calls[0][0] as {
      data: { note?: string }
    }
    expect(data.note).toBeUndefined()
  })

  it('non lascia la controparte vuota se il fornitore non è identificato', async () => {
    await generateSchedulesFromInvoice(
      {
        ...baseInvoice,
        supplierId: null,
        supplierName: null,
        deadlines: [deadline('dl-1', 500, '2026-09-30')],
      },
      'user-1'
    )

    const { data } = vi.mocked(prisma.schedule.create).mock.calls[0][0] as {
      data: { descrizione: string }
    }
    expect(data.descrizione).toContain('Fornitore non identificato')
  })
})

describe('checkInvoiceDeletable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('consente la cancellazione quando nessuna scadenza ha pagamenti', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { id: 's1', descrizione: 'rata 1', importoPagato: new Prisma.Decimal(0), _count: { payments: 0 } },
    ] as never)

    const result = await checkInvoiceDeletable('inv-1')

    expect(result.canDelete).toBe(true)
    expect(result.schedulesWithPayments).toHaveLength(0)
  })

  it('blocca quando una scadenza ha pagamenti registrati', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { id: 's1', descrizione: 'rata 1', importoPagato: new Prisma.Decimal(500), _count: { payments: 1 } },
      { id: 's2', descrizione: 'rata 2', importoPagato: new Prisma.Decimal(0), _count: { payments: 0 } },
    ] as never)

    const result = await checkInvoiceDeletable('inv-1')

    expect(result.canDelete).toBe(false)
    expect(result.schedulesWithPayments).toHaveLength(1)
    expect(result.schedulesWithPayments[0].id).toBe('s1')
  })

  it('blocca anche se l\'importo pagato è valorizzato senza righe di pagamento', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      { id: 's1', descrizione: 'rata 1', importoPagato: new Prisma.Decimal(250), _count: { payments: 0 } },
    ] as never)

    const result = await checkInvoiceDeletable('inv-1')

    expect(result.canDelete).toBe(false)
  })

  it('consente la cancellazione di una fattura senza scadenze generate', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)

    const result = await checkInvoiceDeletable('inv-1')

    expect(result.canDelete).toBe(true)
    expect(result.totalSchedules).toBe(0)
  })
})

describe('softDeleteSchedulesForInvoice', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cancella logicamente le scadenze ancora attive della fattura', async () => {
    vi.mocked(prisma.schedule.updateMany).mockResolvedValue({ count: 2 } as never)

    const count = await softDeleteSchedulesForInvoice('inv-1', 'user-1')

    expect(count).toBe(2)
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1', deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedById: 'user-1' },
    })
  })
})
