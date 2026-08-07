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
    electronicInvoice: { findFirst: vi.fn(), update: vi.fn() },
    schedule: { count: vi.fn() },
    journalEntry: { create: vi.fn() },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/accounts/system', () => ({ getSystemAccount: vi.fn() }))

vi.mock('@/lib/accounts/mapping', () => ({ derivaBudgetCategoryDaConto: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSystemAccount } from '@/lib/accounts/system'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function postCon(body?: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/invoices/inv-1/record', {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { request, context: { params: Promise.resolve({ id: 'inv-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue({
    id: 'inv-1',
    venueId: 'venue-test-123',
    status: 'PENDING',
    accountId: 'conto-costo',
    invoiceDate: new Date('2026-07-01'),
    invoiceNumber: 'FT-1',
    supplierName: 'Fornitore Srl',
    totalAmount: 244,
    vatAmount: 44,
  } as never)
  vi.mocked(prisma.schedule.count).mockResolvedValue(0 as never)
  vi.mocked(getSystemAccount).mockResolvedValue({ id: 'conto-banca' } as never)
  vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'entry-1' } as never)
  vi.mocked(prisma.electronicInvoice.update).mockResolvedValue({ id: 'inv-1' } as never)
  vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
    id: 'cc-str', isDefault: true, isActive: true,
  } as never)
})

describe('POST /api/invoices/[id]/record - centro di costo del movimento', () => {
  it('la regola si valuta sul conto della fattura, non sulla contropartita banca', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-costo', code: '600010', name: 'Acquisti', costCenterRule: 'DEFAULT_STR' },
    ] as never)

    const { request, context } = postCon()
    const response = await POST(request, context)

    expect(response.status).toBe(200)
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['conto-costo'] } } })
    )
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-costo',
          counterpartId: 'conto-banca',
          costCenterId: 'cc-str',
        }),
      })
    )
  })

  it('conto della fattura OBBLIGATORIO senza centro: 400 e nessuna registrazione', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-costo', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const { request, context } = postCon()
    const response = await POST(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Il conto 620010 — Manutenzioni richiede un centro di costo.')
    expect(body.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect(prisma.journalEntry.create).not.toHaveBeenCalled()
    expect(prisma.electronicInvoice.update).not.toHaveBeenCalled()
  })

  it('lo stesso conto con centro esplicito nel corpo: la fattura si registra su quel centro', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-costo', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
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
})
