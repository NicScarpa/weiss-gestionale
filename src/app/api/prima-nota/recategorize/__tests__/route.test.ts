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
    categorizationRule: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/accounts/mapping', () => ({
  derivaBudgetCategoryDaConto: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiestaPost() {
  return new NextRequest('http://localhost:3000/api/prima-nota/recategorize', {
    method: 'POST',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as never)
})

describe('POST /api/prima-nota/recategorize - i movimenti suddivisi restano fuori dal batch', () => {
  it('il where esclude i movimenti con fette (allocations: none)', async () => {
    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          allocations: { none: {} },
        }),
      })
    )
  })
})
