import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    journalEntry: { create: vi.fn() },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function postCon(body?: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/pagamenti/pay-1/esegui', {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { request, context: { params: Promise.resolve({ id: 'pay-1' }) } }
}

const pagamento = {
  id: 'pay-1',
  venueId: 'venue-test-123',
  stato: 'BOZZA',
  dataEsecuzione: new Date('2026-08-07'),
  beneficiarioNome: 'Fornitore Srl',
  causale: 'Saldo fattura',
  riferimentoInterno: null,
  importo: 300,
  note: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  // La route lavora dentro una transazione: il client passato al callback è
  // lo stesso mock, così le asserzioni su journalEntry.create restano valide.
  vi.mocked(prisma.$transaction).mockImplementation((async (
    fn: (tx: unknown) => Promise<unknown>
  ) => fn(prisma)) as typeof prisma.$transaction)
  // Presa in carico riuscita: questa richiesta ha vinto la corsa.
  vi.mocked(prisma.payment.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(prisma.payment.findUniqueOrThrow).mockResolvedValue(pagamento as never)
  vi.mocked(prisma.payment.findUnique).mockResolvedValue(pagamento as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-1' } as never)
  vi.mocked(prisma.payment.update).mockResolvedValue({ id: 'pay-1' } as never)
  vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
    id: 'cc-str', isDefault: true, isActive: true,
  } as never)
})

describe('POST /api/pagamenti/[id]/esegui - centro di costo', () => {
  it('senza corpo il movimento nasce sul centro di default', async () => {
    const { request, context } = postCon()
    const response = await POST(request, context)

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-str' }),
      })
    )
  })

  it('con un centro esplicito e valido il movimento ci finisce sopra', async () => {
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)

    const { request, context } = postCon({ costCenterId: 'cc-produzione' })
    const response = await POST(request, context)

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-produzione' }),
      })
    )
  })

  it('centro inesistente: 400 e il pagamento non si muove', async () => {
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue(null as never)

    const { request, context } = postCon({ costCenterId: 'cc-fantasma' })
    const response = await POST(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('CENTRO_DI_COSTO_NON_VALIDO')
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
    expect(prisma.payment.update).not.toHaveBeenCalled()
  })
})
