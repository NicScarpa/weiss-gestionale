import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
    attendanceAnomaly: { findMany: vi.fn() },
    timekeepingPolicy: { findFirst: vi.fn() },
    workLocation: { findMany: vi.fn() },
    shiftAssignment: { findMany: vi.fn() },
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

  it('carica anche le ore oltre i confini del mese, per il turno che li scavalca', async () => {
    // Turno 31 agosto 22:00 -> 1 settembre 03:00 italiane. Le 5 ore
    // appartengono al 31 agosto, ma l'uscita è un istante di settembre: se la
    // query si fermasse alla mezzanotte del 1°, la notte sparirebbe dal mese.
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-08-31T20:00:00Z'),
      punch('OUT', '2026-09-01T01:00:00Z'),
    ] as never)

    const { records } = await generatePayrollData(8, 2026)

    expect(giornoDi(records, '2026-08-31')?.hours.total).toBe(5)

    const query = vi.mocked(prisma.attendanceRecord.findMany).mock.calls[0][0] as {
      where: { punchedAt: { gte: Date; lt: Date } }
    }
    // La finestra deve estendersi oltre la fine del mese (per l'uscita di
    // settembre) e prima del suo inizio (per l'entrata del turno di luglio
    // che finisce il 1° agosto).
    expect(query.where.punchedAt.lt.getTime()).toBeGreaterThan(
      new Date('2026-09-01T01:00:00Z').getTime()
    )
    expect(query.where.punchedAt.gte.getTime()).toBeLessThan(
      new Date('2026-07-31T22:00:00Z').getTime()
    )
  })

  it('con una regola, entrata e uscita esportate sono quelle riconosciute', async () => {
    // Regola predefinita 09:00-18:00 con arrotondamento entrata 30/tolleranza
    // 5: chi timbra alle 9:06 viene riconosciuto dalle 9:30, e l'export deve
    // mostrare 09:30, altrimenti le colonne del foglio non tornano con le ore.
    vi.mocked(prisma.timekeepingPolicy.findFirst).mockResolvedValue({
      id: 'pol-default',
      name: 'Full time',
      dayStartMinutes: 9 * 60,
      dayEndMinutes: 18 * 60,
      lunchStartMinutes: null,
      lunchEndMinutes: null,
      flexMinutes: 0,
      roundingMinutes: 30,
      roundingToleranceMinutes: 5,
      roundingOutMinutes: null,
      roundingOutToleranceMinutes: null,
      maxDailyMinutes: null,
      contractWeeklyHours: null,
      saturdayAsOvertime: false,
      blockSunday: false,
      singlePunchMode: false,
      extraBreaks: [],
    } as never)
    vi.mocked(prisma.workLocation.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockReset()
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([] as never) // dipendenti con una regola propria
      .mockResolvedValueOnce([dipendente] as never) // organico
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-08-20T07:06:00Z'), // 09:06 italiane
      punch('OUT', '2026-08-20T16:00:00Z'), // 18:00 italiane
    ] as never)

    const { records } = await generatePayrollData(8, 2026, 'venue-1')
    const giorno = giornoDi(records, '2026-08-20')

    expect(giorno?.clockIn?.toISOString()).toBe('2026-08-20T07:30:00.000Z')
    expect(giorno?.hours.total).toBe(8.5)
    // La regola non fissa le ore settimanali: valgono le 40 del contratto,
    // quindi oltre 400 minuti scatta lo straordinario.
    expect(giorno?.hours.overtime).toBeCloseTo(110 / 60, 5)
  })

  it('con la regola che segue il turno, la finestra viene dai turni pubblicati', async () => {
    // Regola predefinita con useShiftAsWindow e blocchi 30/tolleranza 10.
    // Turno pianificato 9:00-17:00; Andrea timbra 8:51-17:00 (estate: 6:51Z).
    // L'anticipo non conta: 8 ore esatte.
    vi.mocked(prisma.timekeepingPolicy.findFirst).mockResolvedValue({
      id: 'pol-turno',
      name: 'Segue il turno',
      dayStartMinutes: 0,
      dayEndMinutes: 0,
      lunchStartMinutes: null,
      lunchEndMinutes: null,
      flexMinutes: 0,
      roundingMinutes: 30,
      roundingToleranceMinutes: 10,
      roundingOutMinutes: null,
      roundingOutToleranceMinutes: null,
      maxDailyMinutes: null,
      contractWeeklyHours: null,
      saturdayAsOvertime: false,
      blockSunday: false,
      singlePunchMode: false,
      useShiftAsWindow: true,
      extraBreaks: [],
    } as never)
    vi.mocked(prisma.workLocation.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockReset()
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([dipendente] as never)
    // Colonne @db.Time: Prisma le restituisce come Date del 1970 in UTC
    vi.mocked(prisma.shiftAssignment.findMany).mockResolvedValue([
      {
        userId: 'user-1',
        date: new Date('2026-08-20T00:00:00Z'),
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
    ] as never)
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-08-20T06:51:00Z'),
      punch('OUT', '2026-08-20T15:00:00Z'),
    ] as never)

    const { records } = await generatePayrollData(8, 2026, 'venue-1')
    const giorno = giornoDi(records, '2026-08-20')

    expect(giorno?.hours.total).toBe(8)
    expect(giorno?.clockIn?.toISOString()).toBe('2026-08-20T07:00:00.000Z')
  })

  // Il turno che segue la pianificazione: le ore oltre la fine restano
  // sospese finché l'anomalia OVERTIME non viene decisa, e la decisione
  // cambia il calcolo da sola, senza correzioni manuali delle timbrature.
  function preparaRegolaTurno() {
    vi.mocked(prisma.timekeepingPolicy.findFirst).mockResolvedValue({
      id: 'pol-turno',
      name: 'Segue il turno',
      dayStartMinutes: 0,
      dayEndMinutes: 0,
      lunchStartMinutes: null,
      lunchEndMinutes: null,
      flexMinutes: 0,
      roundingMinutes: 30,
      roundingToleranceMinutes: 10,
      roundingOutMinutes: null,
      roundingOutToleranceMinutes: null,
      maxDailyMinutes: null,
      contractWeeklyHours: null,
      saturdayAsOvertime: false,
      blockSunday: false,
      singlePunchMode: false,
      useShiftAsWindow: true,
      extraBreaks: [],
    } as never)
    vi.mocked(prisma.workLocation.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockReset()
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([dipendente] as never)
    vi.mocked(prisma.shiftAssignment.findMany).mockResolvedValue([
      {
        userId: 'user-1',
        date: new Date('2026-08-20T00:00:00Z'),
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
    ] as never)
    // Turno 9:00-17:00; timbra 9:00-18:30 italiane (estate: 7:00Z-16:30Z).
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
      punch('IN', '2026-08-20T07:00:00Z'),
      punch('OUT', '2026-08-20T16:30:00Z'),
    ] as never)
  }

  it('le ore oltre il turno senza decisione restano sospese nel record', async () => {
    preparaRegolaTurno()

    const { records } = await generatePayrollData(8, 2026, 'venue-1')
    const giorno = giornoDi(records, '2026-08-20')

    expect(giorno?.hours.total).toBe(8)
    expect(giorno?.pendingReviewMinutes).toBe(90)
  })

  it("l'anomalia di straordinario approvata fa contare le ore oltre il turno", async () => {
    preparaRegolaTurno()
    vi.mocked(prisma.attendanceAnomaly.findMany).mockResolvedValue([
      {
        userId: 'user-1',
        date: new Date('2026-08-20T00:00:00Z'),
        anomalyType: 'OVERTIME',
        status: 'APPROVED',
      },
    ] as never)

    const { records } = await generatePayrollData(8, 2026, 'venue-1')
    const giorno = giornoDi(records, '2026-08-20')

    expect(giorno?.hours.total).toBe(9.5)
    // 40 ore su 6 giorni lavorativi = 400 minuti: i 170 oltre sono straordinario.
    expect(giorno?.hours.overtime).toBeCloseTo(170 / 60, 5)
    expect(giorno?.pendingReviewMinutes).toBe(0)
  })

  it("l'anomalia di straordinario rifiutata taglia la giornata alla fine del turno", async () => {
    preparaRegolaTurno()
    vi.mocked(prisma.attendanceAnomaly.findMany).mockResolvedValue([
      {
        userId: 'user-1',
        date: new Date('2026-08-20T00:00:00Z'),
        anomalyType: 'OVERTIME',
        status: 'REJECTED',
      },
    ] as never)

    const { records } = await generatePayrollData(8, 2026, 'venue-1')
    const giorno = giornoDi(records, '2026-08-20')

    expect(giorno?.hours.total).toBe(8)
    expect(giorno?.pendingReviewMinutes).toBe(0)
  })

  it('con userIds calcola solo le persone richieste', async () => {
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([] as never)

    await generatePayrollData(8, 2026, undefined, { userIds: ['user-1'] })

    const query = vi.mocked(prisma.user.findMany).mock.calls[0][0] as {
      where: { id?: { in: string[] } }
    }
    expect(query.where.id).toEqual({ in: ['user-1'] })
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
