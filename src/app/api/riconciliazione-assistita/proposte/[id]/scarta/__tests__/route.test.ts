import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

/**
 * La rotta non decide: traduce. Il servizio è quindi finto, e ogni prova
 * verifica una sola traduzione — quale stato HTTP e quale messaggio arrivano a
 * chi ha premuto «Scarta».
 */
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/venue', () => ({ getVenueId: vi.fn().mockResolvedValue('venue-1') }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/services/reconciliation-decision-service', () => ({
  scartaProposta: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { scartaProposta } from '@/lib/services/reconciliation-decision-service'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiesta(body: unknown = { perSempre: false }) {
  return new NextRequest(
    'http://localhost:3000/api/riconciliazione-assistita/proposte/prop-1/scarta',
    { method: 'POST', body: JSON.stringify(body) }
  )
}

const contesto = { params: Promise.resolve({ id: 'prop-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(scartaProposta).mockResolvedValue({ outcome: 'ok' })
})

describe('POST /api/riconciliazione-assistita/proposte/[id]/scarta', () => {
  it('«salta per ora» scarta e passa perSempre false al servizio', async () => {
    const res = await POST(richiesta({ perSempre: false }), contesto)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(scartaProposta).toHaveBeenCalledWith({
      proposalId: 'prop-1',
      venueId: 'venue-1',
      userId: 'user-1',
      perSempre: false,
      motivo: undefined,
    })
  })

  it('«non propormelo mai più» passa perSempre true e il motivo al servizio', async () => {
    const res = await POST(richiesta({ perSempre: true, motivo: 'Controparte diversa' }), contesto)

    expect(res.status).toBe(200)
    expect(scartaProposta).toHaveBeenCalledWith({
      proposalId: 'prop-1',
      venueId: 'venue-1',
      userId: 'user-1',
      perSempre: true,
      motivo: 'Controparte diversa',
    })
  })

  it('lascia traccia nel registro di chi ha scartato', async () => {
    await POST(richiesta({ perSempre: true }), contesto)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'ReconciliationProposal',
        entityId: 'prop-1',
        userId: 'user-1',
        newValues: expect.objectContaining({ stato: 'scartata', perSempre: true }),
      })
    )
  })

  it('risponde 400 su un corpo non valido', async () => {
    const res = await POST(richiesta({ perSempre: 'sì' }), contesto)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Dati non validi')
    expect(scartaProposta).not.toHaveBeenCalled()
  })

  it('risponde 400 se manca perSempre', async () => {
    const res = await POST(richiesta({}), contesto)

    expect(res.status).toBe(400)
    expect(scartaProposta).not.toHaveBeenCalled()
  })

  it('risponde 404 su una proposta che non esiste, o di un\'altra sede', async () => {
    vi.mocked(scartaProposta).mockResolvedValue({ outcome: 'proposta_non_trovata' })

    const res = await POST(richiesta(), contesto)

    expect(res.status).toBe(404)
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('risponde 409 su una proposta già decisa, e dice in che stato è', async () => {
    vi.mocked(scartaProposta).mockResolvedValue({ outcome: 'gia_decisa', stato: 'approvata' })

    const res = await POST(richiesta(), contesto)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('approvata')
    expect(body.stato).toBe('approvata')
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('risponde 500 senza dettagli se il servizio si guasta', async () => {
    vi.mocked(scartaProposta).mockRejectedValue(new Error('connessione caduta'))

    const res = await POST(richiesta(), contesto)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Errore interno')
  })

  it('lascia passare il manager', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-2', role: 'manager', venueId: 'venue-1' },
    } as never)

    const res = await POST(richiesta(), contesto)

    expect(res.status).toBe(200)
  })

  it('risponde 403 al dipendente, senza chiamare il servizio', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u', role: 'employee' } } as never)

    const res = await POST(richiesta(), contesto)

    expect(res.status).toBe(403)
    expect(scartaProposta).not.toHaveBeenCalled()
  })
})
