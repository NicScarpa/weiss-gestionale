import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PUT, DELETE } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/services/allocation-service', () => ({
  setEntryAllocations: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { authDiRoute } from '@/test/auth-unitari'
import { setEntryAllocations } from '@/lib/services/allocation-service'
import { createAuditLog } from '@/lib/audit'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiestaPut(body: Record<string, unknown>, id = 'entry-1') {
  const request = new NextRequest(`http://localhost:3000/api/prima-nota/${id}/suddivisione`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id }) } }
}

function richiestaDelete(id = 'entry-1') {
  const request = new NextRequest(`http://localhost:3000/api/prima-nota/${id}/suddivisione`, {
    method: 'DELETE',
  })
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PUT /api/prima-nota/[id]/suddivisione', () => {
  it('rifiuta chi non è autenticato', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(null)

    const { request, context } = richiestaPut({ fette: [] })
    const response = await PUT(request, context)

    expect(response.status).toBe(401)
    expect(setEntryAllocations).not.toHaveBeenCalled()
  })

  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(authDiRoute).mockResolvedValue({ user: { id: 'user-2', role: 'staff' } } as never)

    const { request, context } = richiestaPut({ fette: [] })
    const response = await PUT(request, context)

    expect(response.status).toBe(403)
    expect(setEntryAllocations).not.toHaveBeenCalled()
  })

  it('split ok: chiama il service con la sede della sessione e le fette del body, 200', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(setEntryAllocations).mockResolvedValue({ outcome: 'ok', allocazioni: 2 })

    const { request, context } = richiestaPut({
      fette: [
        { accountId: 'conto-1', importo: 30 },
        { accountId: 'conto-2', importo: 20, note: 'quota affitto' },
      ],
    })
    const response = await PUT(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ esito: 'ok', allocazioni: 2 })
    expect(setEntryAllocations).toHaveBeenCalledWith({
      journalEntryId: 'entry-1',
      venueId: 'venue-test-123',
      userId: 'user-1',
      fette: [
        { accountId: 'conto-1', importo: 30 },
        { accountId: 'conto-2', importo: 20, note: 'quota affitto' },
      ],
    })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'JournalEntry',
        entityId: 'entry-1',
      })
    )
  })

  it('outcome invalid → 400 con il motivo', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(setEntryAllocations).mockResolvedValue({
      outcome: 'invalid',
      motivo: 'La somma delle fette supera l\'importo del movimento',
    })

    const { request, context } = richiestaPut({
      fette: [{ accountId: 'conto-1', importo: 999 }],
    })
    const response = await PUT(request, context)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('La somma delle fette supera l\'importo del movimento')
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('outcome entry_not_found → 404', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(setEntryAllocations).mockResolvedValue({ outcome: 'entry_not_found' })

    const { request, context } = richiestaPut({
      fette: [{ accountId: 'conto-1', importo: 10 }],
    }, 'inesistente')
    const response = await PUT(request, context)

    expect(response.status).toBe(404)
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('valida il body: importo non positivo → 400', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)

    const { request, context } = richiestaPut({
      fette: [{ accountId: 'conto-1', importo: -5 }],
    })
    const response = await PUT(request, context)

    expect(response.status).toBe(400)
    expect(setEntryAllocations).not.toHaveBeenCalled()
  })

  it('valida il body: accountId mancante → 400', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)

    const { request, context } = richiestaPut({
      fette: [{ accountId: '', importo: 10 }],
    })
    const response = await PUT(request, context)

    expect(response.status).toBe(400)
    expect(setEntryAllocations).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/prima-nota/[id]/suddivisione', () => {
  it('rifiuta chi non è autenticato', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(null)

    const { request, context } = richiestaDelete()
    const response = await DELETE(request, context)

    expect(response.status).toBe(401)
    expect(setEntryAllocations).not.toHaveBeenCalled()
  })

  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(authDiRoute).mockResolvedValue({ user: { id: 'user-2', role: 'staff' } } as never)

    const { request, context } = richiestaDelete()
    const response = await DELETE(request, context)

    expect(response.status).toBe(403)
    expect(setEntryAllocations).not.toHaveBeenCalled()
  })

  it('rimuove lo split: chiama il service con fette vuote', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(setEntryAllocations).mockResolvedValue({ outcome: 'ok', allocazioni: 0 })

    const { request, context } = richiestaDelete()
    const response = await DELETE(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ esito: 'ok', allocazioni: 0 })
    expect(setEntryAllocations).toHaveBeenCalledWith({
      journalEntryId: 'entry-1',
      venueId: 'venue-test-123',
      userId: 'user-1',
      fette: [],
    })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        entityType: 'JournalEntry',
        entityId: 'entry-1',
      })
    )
  })

  it('outcome entry_not_found → 404', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(setEntryAllocations).mockResolvedValue({ outcome: 'entry_not_found' })

    const { request, context } = richiestaDelete('inesistente')
    const response = await DELETE(request, context)

    expect(response.status).toBe(404)
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
