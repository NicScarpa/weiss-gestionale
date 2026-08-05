import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { GET, POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/schedule-rules/engine', () => ({
  applicaRegolaCreaMovimento: vi.fn(),
}))

vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({
  applicaStimaSuScadenza: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applicaStimaSuScadenza } from '@/lib/scadenzario/stima-data-attesa'
import { applicaRegolaCreaMovimento } from '@/lib/schedule-rules/engine'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.schedule.count).mockResolvedValue(0 as never)
  vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)
})

describe('GET /api/scadenzario - filtro verificata', () => {
  it('verificata=false restituisce solo le scadenze ancora da verificare', async () => {
    const request = new NextRequest('http://localhost:3000/api/scadenzario?verificata=false')
    await GET(request)

    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ verificata: false }),
      })
    )
  })

  it('verificata=true restituisce solo le scadenze già verificate', async () => {
    const request = new NextRequest('http://localhost:3000/api/scadenzario?verificata=true')
    await GET(request)

    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ verificata: true }),
      })
    )
  })

  it('senza il parametro la verifica non filtra nulla', async () => {
    const request = new NextRequest('http://localhost:3000/api/scadenzario')
    await GET(request)

    const where = vi.mocked(prisma.schedule.findMany).mock.calls[0][0]?.where
    expect(where).not.toHaveProperty('verificata')
  })
})

describe('POST /api/scadenzario - stima della data attesa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(sessione as never)
    vi.mocked(applicaRegolaCreaMovimento).mockResolvedValue({ applicata: false } as never)
    vi.mocked(prisma.schedule.create).mockResolvedValue({
      id: 'sched-nuova',
      importoTotale: 100,
      importoPagato: 0,
    } as never)
    vi.mocked(prisma.schedule.findUnique).mockResolvedValue({
      id: 'sched-nuova',
      importoTotale: 100,
      importoPagato: 0,
    } as never)
  })

  it('dopo la creazione applica la stima della data attesa', async () => {
    const request = new NextRequest('http://localhost:3000/api/scadenzario', {
      method: 'POST',
      body: JSON.stringify({
        tipo: 'passiva',
        descrizione: 'Fattura HERA',
        importoTotale: 100,
        dataScadenza: '2026-09-01',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-nuova', 'venue-test-123')
  })
})
