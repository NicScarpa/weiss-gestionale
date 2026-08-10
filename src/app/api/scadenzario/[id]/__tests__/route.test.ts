import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// `$queryRaw` copre il SELECT ... FOR UPDATE con cui la route blocca la
// scadenza prima di aggiornarla; `$transaction` esegue la callback passandole
// il mock stesso.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    schedulePayment: { aggregate: vi.fn() },
    electronicInvoice: { findFirst: vi.fn(), update: vi.fn() },
    supplier: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({
  applicaStimaSuScadenza: vi.fn(),
  ricalcolaStimeFornitore: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function esistente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    venueId: 'venue-1',
    tipo: 'passiva',
    stato: 'aperta',
    dataAttesaSource: null,
    ...overrides,
  }
}

function patchCon(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/scadenzario/sched-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'sched-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.$transaction).mockImplementation(
    (async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma)) as never
  )
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 'sched-1' }] as never)
  vi.mocked(prisma.schedulePayment.aggregate).mockResolvedValue({
    _sum: { importo: null },
    _max: { dataPagamento: null },
  } as never)
})

describe('PATCH /api/scadenzario/[id] - data attesa manuale', () => {
  it('impostare la data attesa la marca come manuale', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(esistente() as never)
    vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

    const { request, context } = patchCon({ dataAttesa: '2026-09-15' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataAttesa: new Date('2026-09-15'),
          dataAttesaSource: 'manuale',
        }),
      })
    )
    expect(applicaStimaSuScadenza).not.toHaveBeenCalled()
  })

  it('svuotare la data attesa torna alla stima automatica', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ dataAttesaSource: 'manuale' }) as never
    )
    vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

    const { request, context } = patchCon({ dataAttesa: null })
    await PATCH(request, context)

    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dataAttesa: null, dataAttesaSource: null }),
      })
    )
    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', 'venue-1')
  })

  it('sulle scadenze attive la data attesa è rifiutata', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ tipo: 'attiva' }) as never
    )

    const { request, context } = patchCon({ dataAttesa: '2026-09-15' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('cambiare dataScadenza su una scadenza con source stima la ristima', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ dataAttesaSource: 'stima' }) as never
    )
    vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

    const { request, context } = patchCon({ dataScadenza: '2026-10-01' })
    await PATCH(request, context)

    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', 'venue-1')
  })

  it('cambiare dataScadenza con una data attesa manuale non la tocca', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ dataAttesaSource: 'manuale' }) as never
    )
    vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

    const { request, context } = patchCon({ dataScadenza: '2026-10-01' })
    await PATCH(request, context)

    expect(applicaStimaSuScadenza).not.toHaveBeenCalled()
  })

  it('la data attesa non si modifica su una scadenza pagata', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ stato: 'pagata' }) as never
    )

    const { request, context } = patchCon({ dataAttesa: '2026-09-15' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('la data attesa non si sovrascrive se riallineata al movimento riconciliato', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ dataAttesaSource: 'riconciliazione' }) as never
    )

    const { request, context } = patchCon({ dataAttesa: '2026-09-15' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('impostare dataAttesa e dataScadenza insieme: il manuale vince, nessuna ristima', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ dataAttesaSource: 'stima' }) as never
    )
    vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)

    const { request, context } = patchCon({
      dataAttesa: '2026-09-15',
      dataScadenza: '2026-10-01',
    })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dataAttesaSource: 'manuale' }),
      })
    )
    expect(applicaStimaSuScadenza).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/scadenzario/[id] - i campi derivati non si scrivono da qui', () => {
  it('dichiarare lo stato è rifiutato: lo stato discende dai pagamenti', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(esistente() as never)

    const { request, context } = patchCon({ stato: 'pagata' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.schedule.update).not.toHaveBeenCalled()
    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
  })

  it('scrivere la data di pagamento è rifiutato: la porta il pagamento registrato', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(esistente() as never)

    const { request, context } = patchCon({ dataPagamento: '2026-08-01' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.schedule.update).not.toHaveBeenCalled()
  })

  it('la risposta indica su quale route va fatta la modifica', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(esistente() as never)

    const { request, context } = patchCon({ importoPagato: 100 })
    const response = await PATCH(request, context)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.campi).toEqual([
      { campo: 'importoPagato', usare: 'POST /api/scadenzario/[id]/pagamenti' },
    ])
  })
})

describe('PATCH /api/scadenzario/[id] - il cambio fornitore aggiorna le stime', () => {
  it('una scadenza già pagata che resta pagata non ricalcola nulla', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ stato: 'pagata' }) as never
    )
    vi.mocked(prisma.schedule.update).mockResolvedValue({
      id: 'sched-1',
      stato: 'pagata',
      tipo: 'passiva',
      supplierId: 'sup-1',
    } as never)

    const { request, context } = patchCon({ note: 'aggiornata' })
    await PATCH(request, context)

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
  })

  it('cambiare fornitore su una scadenza con source stima la ristima', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ dataAttesaSource: 'stima' }) as never
    )
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: 'sup-2' } as never)
    vi.mocked(prisma.schedule.update).mockResolvedValue({
      id: 'sched-1',
      stato: 'aperta',
      tipo: 'passiva',
      supplierId: 'sup-2',
    } as never)

    const { request, context } = patchCon({ supplierId: 'sup-2' })
    await PATCH(request, context)

    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', 'venue-1')
  })

  it('cambiare fornitore con una data attesa manuale non la tocca', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      esistente({ dataAttesaSource: 'manuale' }) as never
    )
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: 'sup-2' } as never)
    vi.mocked(prisma.schedule.update).mockResolvedValue({
      id: 'sched-1',
      stato: 'aperta',
      tipo: 'passiva',
      supplierId: 'sup-2',
    } as never)

    const { request, context } = patchCon({ supplierId: 'sup-2' })
    await PATCH(request, context)

    expect(applicaStimaSuScadenza).not.toHaveBeenCalled()
  })
})
