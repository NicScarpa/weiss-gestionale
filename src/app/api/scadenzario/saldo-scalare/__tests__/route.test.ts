import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { startOfDay, addDays } from 'date-fns'
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

function scadenza(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    tipo: 'passiva',
    importoTotale: 100,
    importoPagato: 0,
    dataScadenza: new Date('2026-08-10'),
    dataAttesa: null,
    isRicorrente: false,
    stato: 'aperta',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-05T10:00:00'))
  vi.mocked(auth).mockResolvedValue(sessione as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/scadenzario/saldo-scalare - il previsionale lavora sulla data attesa', () => {
  it('colloca la scadenza sul giorno di dataAttesa quando diverge da dataScadenza', async () => {
    vi.mocked(prisma.schedule.findMany)
      .mockResolvedValueOnce([
        scadenza({ dataAttesa: new Date('2026-08-20') }),
      ] as never)
      .mockResolvedValueOnce([] as never)

    const request = new NextRequest('http://localhost:3000/api/scadenzario/saldo-scalare?range=30')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    const giornoContrattuale = data.chartData.find((d: { date: string }) => d.date === '2026-08-10')
    const giornoAtteso = data.chartData.find((d: { date: string }) => d.date === '2026-08-20')
    expect(giornoContrattuale.uscite).toBe(0)
    expect(giornoAtteso.uscite).toBe(100)
  })

  it('senza dataAttesa la scadenza resta sulla data contrattuale', async () => {
    vi.mocked(prisma.schedule.findMany)
      .mockResolvedValueOnce([scadenza()] as never)
      .mockResolvedValueOnce([] as never)

    const request = new NextRequest('http://localhost:3000/api/scadenzario/saldo-scalare?range=30')
    const data = await (await GET(request)).json()

    const giorno = data.chartData.find((d: { date: string }) => d.date === '2026-08-10')
    expect(giorno.uscite).toBe(100)
  })

  it('filtra in SQL sulla data attesa con fallback sulla contrattuale', async () => {
    vi.mocked(prisma.schedule.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)

    const request = new NextRequest('http://localhost:3000/api/scadenzario/saldo-scalare?range=30')
    await GET(request)

    const today = startOfDay(new Date())
    const endDate = addDays(today, 30)
    const finestra = { gte: today, lte: endDate }

    // Scadenze future: dataAttesa nel range, o dataScadenza nel range se
    // dataAttesa è null (null = coincide con la contrattuale)
    expect(prisma.schedule.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { dataAttesa: finestra },
            { dataAttesa: null, dataScadenza: finestra },
          ],
        }),
      })
    )

    // Scadute: stessa logica, prima di oggi
    expect(prisma.schedule.findMany).toHaveBeenNthCalledWith(
      2,
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
