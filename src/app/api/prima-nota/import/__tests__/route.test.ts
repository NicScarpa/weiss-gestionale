import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/api-utils', () => ({
  checkRequestRateLimit: vi.fn(() => ({ allowed: true })),
  RATE_LIMIT_CONFIGS: { IMPORT: { limit: 10, windowMs: 60_000 } },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bankTransaction: { findMany: vi.fn(), update: vi.fn() },
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
  vi.mocked(prisma.$transaction).mockImplementation(
    async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma) as never
  )
  vi.mocked(prisma.bankTransaction.findMany).mockResolvedValue([
    {
      id: 'bt-1',
      transactionDate: new Date('2026-08-01'),
      description: 'Bonifico a Birrificio Srl',
      amount: -1200,
      bankReference: 'REF-1',
    },
  ] as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-1' } as never)
  vi.mocked(prisma.costCenter.findFirst).mockImplementation(
    (async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
      where.code === 'WEISS'
        ? { id: 'cc-weiss', code: 'WEISS', isDefault: false, isActive: true }
        : where.isDefault
          ? { id: 'cc-str', code: 'STR', isDefault: true, isActive: true }
          : null) as never
  )
})

function richiesta() {
  return new NextRequest('http://localhost:3000/api/prima-nota/import', {
    method: 'POST',
    body: JSON.stringify({ batchId: 'batch-1' }),
  })
}

describe('POST /api/prima-nota/import - il centro del movimento importato', () => {
  it('nasce sul centro operativo (WEISS) e da verificare: il conto arriverà dopo', async () => {
    const response = await POST(richiesta())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ created: 1, total: 1 })
    // Nessun conto sulla riga importata: non c'è nessuna regola del piano da
    // rispettare, il sistema sta indovinando.
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.costCenter.findFirst).toHaveBeenCalledWith({
      where: { code: 'WEISS', isActive: true },
    })
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costCenterId: 'cc-weiss',
          categorizationSource: 'import',
          verified: false,
        }),
      })
    )
  })

  it("centro operativo assente dall'anagrafica: si ripiega su quello di sistema, l'import non si ferma", async () => {
    vi.mocked(prisma.costCenter.findFirst).mockImplementation(
      (async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
        where.isDefault ? { id: 'cc-str', code: 'STR', isDefault: true, isActive: true } : null) as never
    )

    const response = await POST(richiesta())

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ costCenterId: 'cc-str' }) })
    )
  })
})
