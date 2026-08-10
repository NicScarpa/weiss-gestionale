import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PUT } from '../route'

// La transazione di PUT lavora su un client "tx" separato da `prisma`: lo
// definiamo con vi.hoisted per poterlo referenziare sia dal mock di
// '@/lib/prisma' (hoistato da vitest) sia dalle asserzioni nei test.
const { mockTx } = vi.hoisted(() => ({
  mockTx: {
    dailyClosure: { update: vi.fn() },
    cashStation: { deleteMany: vi.fn(), create: vi.fn() },
    hourlyPartial: { deleteMany: vi.fn(), createMany: vi.fn() },
    dailyExpense: { deleteMany: vi.fn(), createMany: vi.fn() },
    dailyAttendance: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyClosure: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = {
  user: { id: 'user-1', role: 'manager', venueId: 'venue-test-123' },
} as unknown as Session

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/chiusure/closure-1', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/chiusure/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // `auth` ha più overload (sessione e wrapper middleware): senza `as never`
    // TypeScript sceglie il secondo. È il pattern già in uso negli altri test.
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.dailyClosure.findUnique).mockResolvedValue({
      id: 'closure-1',
      status: 'DRAFT',
      venueId: 'venue-test-123',
    } as never)
    mockTx.dailyClosure.update.mockResolvedValue({ id: 'closure-1', updatedAt: new Date() } as never)
  })

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const response = await PUT(buildRequest({}), { params: Promise.resolve({ id: 'closure-1' }) })

    expect(response.status).toBe(401)
  })

  it('should accept an expense row that explicitly inherits the header cost center (costCenterId: null)', async () => {
    // Stesso difetto del POST: il form invia costCenterId: null sulla riga
    // spesa quando l'utente sceglie "Come chiusura" (ExpensesSection.tsx).
    // Prima del fix lo zod della PUT rifiutava l'intero payload.
    const response = await PUT(
      buildRequest({
        expenses: [{ payee: 'Fornitore Weiss', amount: 40, costCenterId: null }],
      }),
      { params: Promise.resolve({ id: 'closure-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockTx.dailyExpense.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ costCenterId: null }),
        ]),
      })
    )
  })

  it('should still accept an expense row with an explicit cost center override', async () => {
    const response = await PUT(
      buildRequest({
        expenses: [{ payee: 'Fornitore Casetta', amount: 40, costCenterId: 'cas-id' }],
      }),
      { params: Promise.resolve({ id: 'closure-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockTx.dailyExpense.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ costCenterId: 'cas-id' }),
        ]),
      })
    )
  })
})
