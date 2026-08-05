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
    schedule: { findMany: vi.fn() },
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
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/scadenzario/aging - i giorni di ritardo partono dalla data attesa', () => {
  it('classifica nella fascia calcolata da dataAttesa quando diverge da dataScadenza', async () => {
    // Contrattuale a giugno (65 giorni fa), attesa il 26 luglio (10 giorni fa):
    // la fascia giusta è 0-15, non 60-90
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      {
        id: 'sched-1',
        tipo: 'passiva',
        dataScadenza: new Date('2026-06-01'),
        dataAttesa: new Date('2026-07-26'),
        importoTotale: 100,
        importoPagato: 0,
      },
    ] as never)

    const request = new NextRequest('http://localhost:3000/api/scadenzario/aging')
    const data = await (await GET(request)).json()

    const fascia0_15 = data.passive.find((b: { fascia: string }) => b.fascia === '0-15 gg')
    const fascia60_90 = data.passive.find((b: { fascia: string }) => b.fascia === '60-90 gg')
    expect(fascia0_15.conteggio).toBe(1)
    expect(fascia0_15.importo_residuo).toBe(100)
    expect(fascia60_90.conteggio).toBe(0)
  })

  it('senza dataAttesa i giorni si calcolano dalla data contrattuale', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      {
        id: 'sched-1',
        tipo: 'passiva',
        dataScadenza: new Date('2026-07-16'),
        dataAttesa: null,
        importoTotale: 50,
        importoPagato: 0,
      },
    ] as never)

    const request = new NextRequest('http://localhost:3000/api/scadenzario/aging')
    const data = await (await GET(request)).json()

    const fascia15_30 = data.passive.find((b: { fascia: string }) => b.fascia === '15-30 gg')
    expect(fascia15_30.conteggio).toBe(1)
  })

  it('considera scadute le scadenze con data attesa nel passato, con fallback sulla contrattuale', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)

    const request = new NextRequest('http://localhost:3000/api/scadenzario/aging')
    await GET(request)

    const today = new Date('2026-08-05T10:00:00')
    today.setHours(0, 0, 0, 0)

    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { dataAttesa: { lt: today } },
            { dataAttesa: null, dataScadenza: { lt: today } },
          ],
        }),
      })
    )
  })
})
