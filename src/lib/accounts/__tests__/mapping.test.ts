import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { accountBudgetMapping: { findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { derivaBudgetCategoryDaConto } from '../mapping'

beforeEach(() => vi.clearAllMocks())

describe('derivaBudgetCategoryDaConto', () => {
  it('restituisce la categoria mappata sul conto', async () => {
    vi.mocked(prisma.accountBudgetMapping.findUnique).mockResolvedValue({
      accountId: 'conto-1',
      budgetCategoryId: 'cat-1',
      includeInBudget: true,
    } as never)

    await expect(derivaBudgetCategoryDaConto('conto-1')).resolves.toBe('cat-1')
    expect(prisma.accountBudgetMapping.findUnique).toHaveBeenCalledWith({
      where: { accountId: 'conto-1' },
      select: { budgetCategoryId: true, includeInBudget: true },
    })
  })

  it('conto non mappato: null', async () => {
    vi.mocked(prisma.accountBudgetMapping.findUnique).mockResolvedValue(null)
    await expect(derivaBudgetCategoryDaConto('conto-x')).resolves.toBeNull()
  })

  it('mappatura esclusa dal budget: null', async () => {
    vi.mocked(prisma.accountBudgetMapping.findUnique).mockResolvedValue({
      budgetCategoryId: 'cat-1',
      includeInBudget: false,
    } as never)
    await expect(derivaBudgetCategoryDaConto('conto-1')).resolves.toBeNull()
  })
})
