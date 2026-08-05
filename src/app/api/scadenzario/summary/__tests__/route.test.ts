import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { aggregate: vi.fn(), groupBy: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-05T10:00:00'))
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.schedule.aggregate).mockResolvedValue({
    _sum: { importoTotale: 0 },
    _count: 0,
  } as never)
  vi.mocked(prisma.schedule.groupBy).mockResolvedValue([] as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/scadenzario/summary - lo scaduto si giudica sulla data attesa', () => {
  it('il conteggio delle scadute filtra su dataAttesa con fallback sulla contrattuale', async () => {
    const request = new NextRequest('http://localhost:3000/api/scadenzario/summary')
    await GET(request)

    const today = new Date('2026-08-05T10:00:00')
    today.setHours(0, 0, 0, 0)

    // Terza aggregate = scadute. Il filtro sulla data va in AND per non
    // sovrascrivere l'OR di base sulle ricorrenze
    const scaduteCall = vi.mocked(prisma.schedule.aggregate).mock.calls[2][0]
    expect(scaduteCall.where?.OR).toEqual([
      { isRicorrente: false },
      { isRicorrente: true, ricorrenzaAttiva: true },
    ])
    expect(scaduteCall.where?.AND).toEqual([
      {
        OR: [
          { dataAttesa: { lte: today } },
          { dataAttesa: null, dataScadenza: { lte: today } },
        ],
      },
    ])
  })

  it('anche le scadenze in arrivo nei 7 giorni si contano sulla data attesa', async () => {
    const request = new NextRequest('http://localhost:3000/api/scadenzario/summary')
    await GET(request)

    const today = new Date('2026-08-05T10:00:00')
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const finestra = { gte: today, lte: nextWeek }

    const inScadenzaCall = vi.mocked(prisma.schedule.aggregate).mock.calls[3][0]
    expect(inScadenzaCall.where?.AND).toEqual([
      {
        OR: [
          { dataAttesa: finestra },
          { dataAttesa: null, dataScadenza: finestra },
        ],
      },
    ])
  })
})
