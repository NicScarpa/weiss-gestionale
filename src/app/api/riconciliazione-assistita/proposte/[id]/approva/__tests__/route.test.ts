import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { POST } from '../route'

/**
 * La rotta non decide: traduce. Il servizio è quindi finto, e ogni prova
 * verifica una sola traduzione — quale stato HTTP e quale messaggio arrivano a
 * chi ha premuto «Approva».
 */
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/venue', () => ({ getVenueId: vi.fn().mockResolvedValue('venue-1') }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/services/reconciliation-decision-service', () => ({
  approvaProposta: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { approvaProposta } from '@/lib/services/reconciliation-decision-service'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiesta() {
  return new NextRequest(
    'http://localhost:3000/api/riconciliazione-assistita/proposte/prop-1/approva',
    { method: 'POST' }
  )
}

const contesto = { params: Promise.resolve({ id: 'prop-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(approvaProposta).mockResolvedValue({
    outcome: 'ok',
    journalEntryId: 'mov-1',
    reconciliationIds: ['ric-1'],
  })
})

describe('POST /api/riconciliazione-assistita/proposte/[id]/approva', () => {
  it('approva e restituisce il movimento nato dalla riga bancaria', async () => {
    const res = await POST(richiesta(), contesto)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, journalEntryId: 'mov-1', reconciliationIds: ['ric-1'] })
    expect(approvaProposta).toHaveBeenCalledWith({
      proposalId: 'prop-1',
      venueId: 'venue-1',
      userId: 'user-1',
    })
  })

  it('lascia traccia nel registro di chi ha approvato', async () => {
    await POST(richiesta(), contesto)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'ReconciliationProposal',
        entityId: 'prop-1',
        userId: 'user-1',
        newValues: expect.objectContaining({ stato: 'approvata', journalEntryId: 'mov-1' }),
      })
    )
  })

  it('risponde 404 su una proposta che non esiste, o di un\'altra sede', async () => {
    vi.mocked(approvaProposta).mockResolvedValue({ outcome: 'proposta_non_trovata' })

    const res = await POST(richiesta(), contesto)

    expect(res.status).toBe(404)
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('risponde 409 su una proposta già decisa, e dice in che stato è', async () => {
    vi.mocked(approvaProposta).mockResolvedValue({ outcome: 'gia_decisa', stato: 'approvata' })

    const res = await POST(richiesta(), contesto)
    const body = await res.json()

    // Il doppio clic finisce qui: la prima chiamata ha già promosso la riga.
    expect(res.status).toBe(409)
    expect(body.error).toContain('approvata')
    expect(body.stato).toBe('approvata')
  })

  it('risponde 409 col motivo su una proposta superata', async () => {
    vi.mocked(approvaProposta).mockResolvedValue({
      outcome: 'superata',
      motivo: 'La scadenza è pagata',
    })

    const res = await POST(richiesta(), contesto)
    const body = await res.json()

    // Il motivo non si riscrive qui: è la frase che spiega perché la proposta
    // non vale più, e l'utente la legge tale e quale.
    expect(res.status).toBe(409)
    expect(body.error).toBe('La scadenza è pagata')
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('risponde 422 quando la promozione rifiuta', async () => {
    vi.mocked(approvaProposta).mockResolvedValue({
      outcome: 'riconciliazione_rifiutata',
      motivo: 'Gli importi superano il residuo del movimento (100,00 €)',
    })

    const res = await POST(richiesta(), contesto)
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toContain('superano il residuo')
  })

  it('risponde 500 senza dettagli se il servizio si guasta', async () => {
    vi.mocked(approvaProposta).mockRejectedValue(new Error('connessione caduta'))

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
    expect(approvaProposta).not.toHaveBeenCalled()
  })
})
