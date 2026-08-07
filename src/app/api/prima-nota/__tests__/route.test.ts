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
  },
}))

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function postCon(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/prima-nota', {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-08-07',
      registerType: 'BANK',
      entryType: 'USCITA',
      amount: 100,
      description: 'Riparazione impianto',
      ...body,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({
    id: 'entry-1', debitAmount: null, creditAmount: 100, vatAmount: null,
  } as never)
  vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
    id: 'cc-str', isDefault: true, isActive: true,
  } as never)
})

describe('POST /api/prima-nota - centro di costo del movimento', () => {
  it('senza conto il movimento nasce sul centro di default', async () => {
    const response = await POST(postCon({}))

    expect(response.status).toBe(201)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-str' }),
      })
    )
    // Nessun conto da ispezionare: si va dritti al default
    expect(prisma.account.findMany).not.toHaveBeenCalled()
  })

  it('conto OBBLIGATORIO senza centro: 400 con motivo e code, nessuna scrittura', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const response = await POST(postCon({ accountId: 'conto-1' }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Il conto 620010 — Manutenzioni richiede un centro di costo.')
    expect(body.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })

  it('conto OBBLIGATORIO con centro esplicito: il movimento nasce su quel centro', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)

    const response = await POST(postCon({ accountId: 'conto-1', costCenterId: 'cc-produzione' }))

    expect(response.status).toBe(201)
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-1',
          costCenterId: 'cc-produzione',
        }),
      })
    )
  })

  it('centro disattivato: 400 CENTRO_DI_COSTO_NON_VALIDO', async () => {
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-chiuso', isActive: false,
    } as never)

    const response = await POST(postCon({ costCenterId: 'cc-chiuso' }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('CENTRO_DI_COSTO_NON_VALIDO')
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
  })
})
