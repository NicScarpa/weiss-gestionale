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
    schedule: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { authDiRoute } from '@/test/auth-unitari'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiesta(id = 'sched-1') {
  const request = new NextRequest(`http://localhost:3000/api/scadenzario/${id}/verifica`, {
    method: 'PATCH',
  })
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/scadenzario/[id]/verifica', () => {
  it('rifiuta chi non è autenticato', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(null)

    const { request, context } = richiesta()
    const response = await PATCH(request, context)

    expect(response.status).toBe(401)
  })

  it('rifiuta i ruoli senza accesso ai dati finanziari', async () => {
    vi.mocked(authDiRoute).mockResolvedValue({
      user: { id: 'user-2', role: 'staff' },
    } as never)

    const { request, context } = richiesta()
    const response = await PATCH(request, context)

    expect(response.status).toBe(403)
  })

  it('404 se la scadenza non esiste nella sede', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null)

    const { request, context } = richiesta('inesistente')
    const response = await PATCH(request, context)

    expect(response.status).toBe(404)
  })

  it('inverte lo stato di verifica: una scadenza non verificata diventa verificata', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      id: 'sched-1',
      verificata: false,
    } as never)
    vi.mocked(prisma.schedule.update).mockResolvedValue({
      id: 'sched-1',
      verificata: true,
    } as never)

    const { request, context } = richiesta()
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ id: 'sched-1', verificata: true })
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sched-1' },
        data: { verificata: true },
      })
    )
  })

  it('la verifica è un toggle: una scadenza verificata torna da verificare', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      id: 'sched-1',
      verificata: true,
    } as never)
    vi.mocked(prisma.schedule.update).mockResolvedValue({
      id: 'sched-1',
      verificata: false,
    } as never)

    const { request, context } = richiesta()
    const response = await PATCH(request, context)
    const data = await response.json()

    expect(data.verificata).toBe(false)
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { verificata: false } })
    )
  })

  it('cerca la scadenza dentro la sede corrente, non ovunque', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      id: 'sched-1',
      verificata: false,
    } as never)
    vi.mocked(prisma.schedule.update).mockResolvedValue({
      id: 'sched-1',
      verificata: true,
    } as never)

    const { request, context } = richiesta()
    await PATCH(request, context)

    expect(prisma.schedule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sched-1', venueId: 'venue-test-123' }),
      })
    )
  })
})
