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
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

/** Regola che matcha per keyword e imputa al conto indicato */
function regola(id: string, accountId: string) {
  return {
    id,
    keywords: ['affitto'],
    direction: null,
    accountId,
    budgetCategoryId: null,
    autoVerify: true,
    priority: 0,
  }
}

/** Movimento in uscita, non verificato, senza centro di costo */
function movimento(id: string, costCenterId: string | null = null) {
  return {
    id,
    description: 'Affitto locale',
    debitAmount: null,
    creditAmount: 500,
    costCenterId,
  }
}

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

describe('POST /api/prima-nota/recategorize - il centro di costo non fa fallire il batch', () => {
  it('la riga senza centro viene saltata e contata, le altre passano', async () => {
    vi.mocked(prisma.categorizationRule.findMany).mockResolvedValue([
      regola('rule-obbligatorio', 'conto-obbligatorio'),
    ] as never)
    // Due movimenti che la stessa regola vorrebbe imputare a un conto
    // OBBLIGATORIO: il primo non ha un centro di costo, il secondo sì.
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      movimento('entry-bloccato'),
      movimento('entry-ok', 'cc-produzione'),
    ] as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      {
        id: 'conto-obbligatorio',
        code: '620010',
        name: 'Manutenzioni',
        costCenterRule: 'OBBLIGATORIO',
      },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-ok' } as never)

    const response = await POST(richiestaPost())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ processed: 2, updated: 1, saltati: 1 })

    // Il movimento bloccato non è stato toccato; quello con centro sì
    expect(prisma.journalEntry.update).toHaveBeenCalledTimes(1)
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-ok' },
        data: expect.objectContaining({ costCenterId: 'cc-produzione' }),
      })
    )
  })
})
