import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { create: vi.fn() },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({
    id: 'entry-1', debitAmount: 200, creditAmount: 200,
  } as never)
  // La forma ad array di $transaction: le create sono già state costruite
  vi.mocked(prisma.$transaction).mockImplementation(
    (operazioni: unknown) => Promise.all(operazioni as Promise<unknown>[]) as never
  )
  vi.mocked(prisma.costCenter.findFirst).mockImplementation(
    (async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
      where.code === 'WEISS'
        ? { id: 'cc-weiss', code: 'WEISS', isDefault: false, isActive: true }
        : where.isDefault
          ? { id: 'cc-str', code: 'STR', isDefault: true, isActive: true }
          : null) as never
  )
})

/**
 * Versare l'incasso di serata è un'operazione del locale: il form non ha un
 * campo centro, quindi lo sceglie il sistema, e sceglie il centro operativo —
 * chi filtra la prima nota per il proprio centro deve ritrovarci i propri
 * versamenti. Sul conto economico non incide: i giroconti usano conti
 * patrimoniali, che il report esclude.
 */
describe('POST /api/prima-nota/versamento - il giroconto va sul centro operativo', () => {
  it('entrambe le scritture nascono sullo stesso centro, senza ispezionare conti', async () => {
    const request = new NextRequest('http://localhost:3000/api/prima-nota/versamento', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-08-07', amount: 200 }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.create).toHaveBeenCalledTimes(2)
    const centri = vi
      .mocked(prisma.journalEntry.create)
      .mock.calls.map((c) => c[0].data.costCenterId)
    expect(centri).toEqual(['cc-weiss', 'cc-weiss'])
  })
})
