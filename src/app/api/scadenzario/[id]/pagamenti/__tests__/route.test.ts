import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({ ricalcolaStimeFornitore: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    schedulePayment: { create: vi.fn(), aggregate: vi.fn() },
    electronicInvoice: { update: vi.fn() },
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function pagamento(importo: number) {
  const request = new NextRequest('http://localhost:3000/api/scadenzario/sched-1/pagamenti', {
    method: 'POST',
    body: JSON.stringify({ importo, dataPagamento: '2026-08-01' }),
  })
  return { request, context: { params: Promise.resolve({ id: 'sched-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
    id: 'sched-1',
    venueId: 'venue-1',
    tipo: 'passiva',
    supplierId: 'sup-1',
    importoTotale: 100,
    importoPagato: 0,
    stato: 'aperta',
    dataPagamento: null,
    invoiceId: null,
  } as never)
  vi.mocked(prisma.schedulePayment.create).mockResolvedValue({ id: 'pay-1' } as never)
  vi.mocked(prisma.schedule.update).mockResolvedValue({ id: 'sched-1' } as never)
})

describe('POST /api/scadenzario/[id]/pagamenti - ricalcolo stime', () => {
  it('quando il pagamento salda una passiva con fornitore, ricalcola le stime', async () => {
    vi.mocked(prisma.schedulePayment.aggregate).mockResolvedValue({
      _sum: { importo: 100 },
    } as never)

    const { request, context } = pagamento(100)
    const response = await POST(request, context)

    expect(response.status).toBe(200)
    expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', 'venue-1')
  })

  it('un acconto parziale non ricalcola nulla', async () => {
    vi.mocked(prisma.schedulePayment.aggregate).mockResolvedValue({
      _sum: { importo: 40 },
    } as never)

    const { request, context } = pagamento(40)
    await POST(request, context)

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
  })
})
