import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    electronicInvoice: { findFirst: vi.fn() },
    invoiceLineAccount: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/sdi/parser', () => ({
  parseFatturaPA: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { parseFatturaPA } from '@/lib/sdi/parser'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

const fatturaEsistente = {
  id: 'fatt-1',
  venueId: 'venue-test-123',
  xmlContent: '<xml>contenuto</xml>',
}

const dettaglioLineeFisse = [
  { numeroLinea: 1, descrizione: 'Farina 00', prezzoUnitario: 25.5, prezzoTotale: 25.5, aliquotaIVA: 4 },
  { numeroLinea: 2, descrizione: 'Zucchero', prezzoUnitario: 10, prezzoTotale: 10, aliquotaIVA: 4 },
]

function richiesta(body: Record<string, unknown>, id = 'fatt-1') {
  const request = new NextRequest(`http://localhost:3000/api/invoices/${id}/righe-conti`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(parseFatturaPA).mockReturnValue({
    dettaglioLinee: dettaglioLineeFisse,
  } as never)
})

describe('PATCH /api/invoices/[id]/righe-conti', () => {
  it('rifiuta chi non è autenticato', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(401)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
  })

  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-2', role: 'staff' } } as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(403)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
  })

  it('404 se la fattura non esiste nella sede', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(null)

    const { request, context } = richiesta(
      { righe: [{ numeroLinea: 1, accountId: 'conto-1' }] },
      'inesistente'
    )
    const response = await PATCH(request, context)

    expect(response.status).toBe(404)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
  })

  it('conferma una riga: upsert con snapshot dall\'XML e stato confermata', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.upsert).mockResolvedValue({} as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 1, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.invoiceLineAccount.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.invoiceLineAccount.upsert).toHaveBeenCalledWith({
      where: { invoiceId_numeroLinea: { invoiceId: 'fatt-1', numeroLinea: 1 } },
      create: expect.objectContaining({
        invoiceId: 'fatt-1',
        numeroLinea: 1,
        descrizione: 'Farina 00',
        importo: 25.5,
        accountId: 'conto-1',
        stato: 'confermata',
        fonte: 'manuale',
        confirmedById: 'user-1',
        confirmedAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        descrizione: 'Farina 00',
        importo: 25.5,
        accountId: 'conto-1',
        stato: 'confermata',
        fonte: 'manuale',
        confirmedById: 'user-1',
        confirmedAt: expect.any(Date),
      }),
    })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'ElectronicInvoice',
        entityId: 'fatt-1',
      })
    )
  })

  it('numeroLinea inesistente nell\'XML → 400 senza scritture', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)

    const { request, context } = richiesta({ righe: [{ numeroLinea: 99, accountId: 'conto-1' }] })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.invoiceLineAccount.upsert).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.updateMany).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('confermaTutte: aggiorna tutte le righe in stato proposta con updateMany', async () => {
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
    vi.mocked(prisma.invoiceLineAccount.updateMany).mockResolvedValue({ count: 3 } as never)

    const { request, context } = richiesta({ confermaTutte: true })
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(prisma.invoiceLineAccount.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: 'fatt-1', stato: 'proposta' },
      data: expect.objectContaining({
        stato: 'confermata',
        confirmedById: 'user-1',
        confirmedAt: expect.any(Date),
      }),
    })
    expect(data.tutteConfermate).toBe(3)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'ElectronicInvoice',
        entityId: 'fatt-1',
      })
    )
  })
})
