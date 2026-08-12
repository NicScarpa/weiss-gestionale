import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { GET } from '../route'
import { DELETE, PATCH } from '../[id]/route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    supplierProductAccount: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { authDiRoute } from '@/test/auth-unitari'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session
const sessioneStaff = { user: { id: 'user-2', role: 'staff' } } as unknown as Session

const memoria = {
  id: 'mem-1',
  venueId: 'venue-test-123',
  supplierId: 'forn-1',
  nomeNormalizzato: 'farina 00 25kg',
  codiceArticolo: 'FAR25',
  accountId: 'conto-1',
  conferme: 4,
  updatedAt: new Date('2026-08-01'),
  supplier: { id: 'forn-1', name: 'Molino Rossi' },
  account: { id: 'conto-1', code: '60.10', name: 'Materie prime' },
}

function richiestaGet(query = '') {
  return new NextRequest(`http://localhost:3000/api/memorie-fornitore${query}`)
}

function richiestaSuId(metodo: 'DELETE' | 'PATCH', id = 'mem-1', body?: unknown) {
  const request = new NextRequest(`http://localhost:3000/api/memorie-fornitore/${id}`, {
    method: metodo,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
  vi.mocked(prisma.supplierProductAccount.findMany).mockResolvedValue([memoria] as never)
  vi.mocked(prisma.supplierProductAccount.count).mockResolvedValue(1 as never)
  vi.mocked(prisma.supplierProductAccount.findFirst).mockResolvedValue(memoria as never)
  vi.mocked(prisma.supplierProductAccount.delete).mockResolvedValue(memoria as never)
  vi.mocked(prisma.supplierProductAccount.update).mockResolvedValue(memoria as never)
  vi.mocked(prisma.account.findFirst).mockResolvedValue({
    id: 'conto-2',
    code: '60.20',
    name: 'Pulizie',
  } as never)
})

describe('GET /api/memorie-fornitore', () => {
  it('rifiuta chi non è autenticato', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(null)

    expect((await GET(richiestaGet())).status).toBe(401)
  })

  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessioneStaff as never)

    expect((await GET(richiestaGet())).status).toBe(403)
  })

  it('elenca solo le memorie della sede in sessione', async () => {
    const response = await GET(richiestaGet())
    const dati = await response.json()

    expect(response.status).toBe(200)
    expect(prisma.supplierProductAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ venueId: 'venue-test-123' }),
      })
    )
    expect(dati.memorie[0]).toMatchObject({
      id: 'mem-1',
      nomeNormalizzato: 'farina 00 25kg',
      conferme: 4,
      fornitore: { id: 'forn-1', nome: 'Molino Rossi' },
      conto: { id: 'conto-1', codice: '60.10', nome: 'Materie prime' },
    })
    expect(dati.totale).toBe(1)
  })

  it('la ricerca libera cerca nel nome del prodotto e in quello del fornitore', async () => {
    await GET(richiestaGet('?q=farina'))

    const where = vi.mocked(prisma.supplierProductAccount.findMany).mock.calls[0][0]
      ?.where as Record<string, unknown>
    expect(where.OR).toEqual([
      { nomeNormalizzato: { contains: 'farina', mode: 'insensitive' } },
      { supplier: { name: { contains: 'farina', mode: 'insensitive' } } },
    ])
  })

  it('filtra per fornitore quando richiesto', async () => {
    await GET(richiestaGet('?supplierId=forn-1'))

    expect(prisma.supplierProductAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ supplierId: 'forn-1' }),
      })
    )
  })
})

describe('DELETE /api/memorie-fornitore/[id]', () => {
  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessioneStaff as never)
    const { request, context } = richiestaSuId('DELETE')

    expect((await DELETE(request, context)).status).toBe(403)
    expect(prisma.supplierProductAccount.delete).not.toHaveBeenCalled()
  })

  it('404 su una memoria di un\'altra sede, senza cancellare niente', async () => {
    vi.mocked(prisma.supplierProductAccount.findFirst).mockResolvedValue(null)
    const { request, context } = richiestaSuId('DELETE')

    expect((await DELETE(request, context)).status).toBe(404)
    expect(prisma.supplierProductAccount.delete).not.toHaveBeenCalled()
  })

  it('cancella la memoria e lascia traccia in audit di cosa mappava', async () => {
    const { request, context } = richiestaSuId('DELETE')
    const response = await DELETE(request, context)

    expect(response.status).toBe(200)
    expect(prisma.supplierProductAccount.delete).toHaveBeenCalledWith({ where: { id: 'mem-1' } })
    // La riga sparisce dal database: se l'audit non porta con sé cosa
    // mappava, non resta da nessuna parte traccia di cosa è stato dimenticato.
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        entityType: 'SupplierProductAccount',
        entityId: 'mem-1',
        venueId: 'venue-test-123',
        oldValues: expect.objectContaining({
          nomeNormalizzato: 'farina 00 25kg',
          accountId: 'conto-1',
        }),
      })
    )
  })
})

describe('PATCH /api/memorie-fornitore/[id]', () => {
  it('corregge il conto e riporta le conferme a una', async () => {
    const { request, context } = richiestaSuId('PATCH', 'mem-1', { accountId: 'conto-2' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    // Le quattro conferme valevano per il conto vecchio: tenerle direbbe che
    // questa mappatura è stata confermata quattro volte, e non è vero.
    expect(prisma.supplierProductAccount.update).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: { accountId: 'conto-2', conferme: 1 },
    })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'SupplierProductAccount',
        oldValues: expect.objectContaining({ accountId: 'conto-1' }),
        newValues: expect.objectContaining({ accountId: 'conto-2' }),
      })
    )
  })

  it('rifiuta un conto che non esiste, non è attivo o non è di costo', async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null)
    const { request, context } = richiestaSuId('PATCH', 'mem-1', { accountId: 'conto-ricavo' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, type: 'COSTO' }),
      })
    )
    expect(prisma.supplierProductAccount.update).not.toHaveBeenCalled()
  })

  it('rifiuta un corpo senza conto', async () => {
    const { request, context } = richiestaSuId('PATCH', 'mem-1', {})

    expect((await PATCH(request, context)).status).toBe(400)
    expect(prisma.supplierProductAccount.update).not.toHaveBeenCalled()
  })
})
