import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
    attendanceAnomaly: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { generatePayrollData } from '../payroll-calculator'

const dipendente = {
  id: 'user-1',
  firstName: 'Andrea',
  lastName: 'Segatto',
  contractType: 'TEMPO_INDETERMINATO',
  contractHoursWeek: 40,
  hourlyRateBase: null,
  hourlyRateExtra: null,
  hourlyRateHoliday: null,
  hourlyRateNight: null,
}

function punch(punchType: 'IN' | 'OUT', iso: string) {
  return { userId: 'user-1', punchType, punchedAt: new Date(iso) }
}

function giornoDi(records: Awaited<ReturnType<typeof generatePayrollData>>['records'], giorno: string) {
  return records.find((r) => r.date.toISOString().slice(0, 10) === giorno)
}

describe('generatePayrollData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findMany).mockResolvedValue([dipendente] as never)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.attendanceAnomaly.findMany).mockResolvedValue([] as never)
  })

  it('attribuisce il turno serale al giorno italiano in cui è iniziato', async () => {
    // 20 agosto 2026, ora legale: le 21:00 italiane sono le 19:00 UTC,
    // e l'uscita all'01:00 del 21 è alle 23:00 UTC del 20.
    // Il turno appartiene per intero al 20 agosto.
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-08-20T19:00:00Z'),
      punch('OUT', '2026-08-20T23:00:00Z'),
    ] as never)

    const { records } = await generatePayrollData(8, 2026)

    expect(giornoDi(records, '2026-08-20')?.hours.total).toBe(4)
    expect(giornoDi(records, '2026-08-21')?.hours.total).toBe(0)
  })

  it('conta come notturne solo le ore dopo le 22 italiane', async () => {
    // 21:00 -> 01:00 italiane: notturne dalle 22 all'una, cioè 3 ore
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-08-20T19:00:00Z'),
      punch('OUT', '2026-08-20T23:00:00Z'),
    ] as never)

    const { records } = await generatePayrollData(8, 2026)

    expect(giornoDi(records, '2026-08-20')?.hours.night).toBe(3)
  })

  it("d'inverno usa lo stesso metro, con un'ora sola di scarto da UTC", async () => {
    // 15 gennaio, ora solare: 21:00 italiane = 20:00 UTC
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-01-15T20:00:00Z'),
      punch('OUT', '2026-01-16T00:00:00Z'),
    ] as never)

    const { records } = await generatePayrollData(1, 2026)

    expect(giornoDi(records, '2026-01-15')?.hours.total).toBe(4)
    expect(giornoDi(records, '2026-01-15')?.hours.night).toBe(3)
  })

  it('nella notte in cui scatta l ora legale conta le ore realmente lavorate', async () => {
    // 28 marzo 2026, turno 22:00 -> 03:00 italiane. Alle 02:00 l'orologio salta
    // alle 03:00, quindi le ore lavorate sono 4, non 5.
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-03-28T21:00:00Z'),
      punch('OUT', '2026-03-29T01:00:00Z'),
    ] as never)

    const { records } = await generatePayrollData(3, 2026)

    expect(giornoDi(records, '2026-03-28')?.hours.total).toBe(4)
    expect(giornoDi(records, '2026-03-28')?.hours.night).toBe(4)
  })
})
