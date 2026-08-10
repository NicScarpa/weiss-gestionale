import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({ ricalcolaStimeFornitore: vi.fn() }))
// `$queryRaw` copre il SELECT ... FOR UPDATE con cui la route blocca la
// scadenza; `$transaction` esegue la callback passandole il mock stesso.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    schedulePayment: { create: vi.fn(), aggregate: vi.fn() },
    electronicInvoice: { update: vi.fn(), findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function pagamento(importo: number) {
  const request = new NextRequest('http://localhost:3000/api/scadenzario/sched-1/pagamenti', {
    method: 'POST',
    body: JSON.stringify({ importo, dataPagamento: '2026-08-01' }),
  })
  return { request, context: { params: Promise.resolve({ id: 'sched-1' }) } }
}

/**
 * Pagamenti finti in memoria: la route verifica il residuo *prima* di creare
 * il pagamento e ricalcola lo stato *dopo*, quindi la somma dei pagamenti deve
 * cambiare fra le due letture come farebbe il database.
 */
const pagamentiFinti: number[] = []

beforeEach(() => {
  vi.clearAllMocks()
  pagamentiFinti.length = 0
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.$transaction).mockImplementation(
    (async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma)) as never
  )
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 'sched-1' }] as never)
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
    id: 'sched-1',
    venueId: 'venue-1',
    tipo: 'passiva',
    supplierId: 'sup-1',
    importoTotale: new Prisma.Decimal(100),
    importoPagato: new Prisma.Decimal(0),
    stato: 'aperta',
    dataAttesaSource: null,
    dataScadenza: new Date('2026-07-31'),
    invoiceId: null,
  } as never)
  vi.mocked(prisma.schedulePayment.create).mockImplementation((async (args: {
    data: { importo: number }
  }) => {
    pagamentiFinti.push(Number(args.data.importo))
    return { id: 'pay-1' }
  }) as never)
  vi.mocked(prisma.schedulePayment.aggregate).mockImplementation((async () => ({
    _sum: {
      importo:
        pagamentiFinti.length === 0
          ? null
          : new Prisma.Decimal(pagamentiFinti.reduce((t, i) => t + i, 0)),
    },
    _max: { dataPagamento: pagamentiFinti.length === 0 ? null : new Date('2026-08-01') },
  })) as never)
  vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)
})

describe('POST /api/scadenzario/[id]/pagamenti - ricalcolo stime', () => {
  it('quando il pagamento salda una passiva con fornitore, ricalcola le stime', async () => {
    const { request, context } = pagamento(100)
    const response = await POST(request, context)

    expect(response.status).toBe(200)
    expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', 'venue-1')
  })

  it('un acconto parziale non ricalcola nulla', async () => {
    const { request, context } = pagamento(40)
    await POST(request, context)

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
  })

  it('un importo oltre il residuo non arriva nemmeno a creare il pagamento', async () => {
    const { request, context } = pagamento(10_000)
    const response = await POST(request, context)

    expect(response.status).toBe(422)
    expect(prisma.schedulePayment.create).not.toHaveBeenCalled()
  })
})
