import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findUnique: vi.fn(), update: vi.fn() },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
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
import { createAuditLog } from '@/lib/audit'

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
  vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
    id: 'entry-1',
    costCenterId: null,
    _count: { allocations: 0 },
  } as never)
  // Conto che non pretende un centro: la risoluzione cade sul default (STR).
  vi.mocked(prisma.account.findMany).mockResolvedValue([
    { id: 'conto-1', code: '710010', name: 'Vendite bar', costCenterRule: 'DEFAULT_STR' },
  ] as never)
  vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
    id: 'cc-str', isDefault: true, isActive: true,
  } as never)
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
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({ budgetCategoryId: 'cat-derivata' }),
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

describe('PATCH /api/prima-nota/[id]/categorize - il centro di costo del nuovo conto', () => {
  it('il conto non pretende un centro: il movimento prende il default', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    await PATCH(request, context)

    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBe('cc-str')
  })

  it('conto OBBLIGATORIO su un movimento senza centro: 400 con il code e nessuna scrittura', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Il conto 620010 — Manutenzioni richiede un centro di costo.')
    expect(body.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('stesso conto OBBLIGATORIO ma il movimento ha già un centro: passa e lo conserva', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: 'cc-produzione',
      _count: { allocations: 0 },
    } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBe(
      'cc-produzione'
    )
  })

  it('senza conto nel corpo il centro non si tocca', async () => {
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
    await PATCH(request, context)

    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBeUndefined()
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/prima-nota/[id]/categorize - un movimento suddiviso in fette è protetto', () => {
  it('movimento con fette: 409 e update mai chiamato', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      _count: { allocations: 2 },
    } as never)

    const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toBe('Il movimento è suddiviso in fette: rimuovi prima la suddivisione')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })
})
