import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findUnique: vi.fn(), update: vi.fn() },
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
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function patchCon(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/prima-nota/entry-1/categorize', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'entry-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({ id: 'entry-1' } as never)
})

describe('PATCH /api/prima-nota/[id]/categorize - la categoria si deriva dal conto', () => {
  it('con accountId la categoria si deriva dal conto', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-1',
          budgetCategoryId: 'cat-derivata',
          categorizationSource: 'manual',
        }),
      })
    )
  })

  it('il conto vince: budgetCategoryId esplicito ignorato se c\'è accountId', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1', budgetCategoryId: 'cat-esplicita' })
    await PATCH(request, context)

    const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
    expect(data.budgetCategoryId).toBe('cat-derivata')
  })

  it('conto non mappato: la categoria derivata è null', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue(null)
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    await PATCH(request, context)

    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.budgetCategoryId).toBeNull()
  })

  it('senza conto, la categoria esplicita resta accettata (transizione)', async () => {
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
    await PATCH(request, context)

    const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
    expect(data.budgetCategoryId).toBe('cat-1')
    expect(derivaBudgetCategoryDaConto).not.toHaveBeenCalled()
  })
})
