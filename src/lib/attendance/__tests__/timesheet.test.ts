import { describe, it, expect } from 'vitest'
import { buildMonthlyTimesheet, formatHoursMinutes } from '../timesheet'
import type { PayrollRecord, PayrollSummary } from '../payroll-calculator'

describe('formatHoursMinutes', () => {
  it('trasforma le ore decimali in ore e minuti leggibili', () => {
    expect(formatHoursMinutes(7.75)).toBe('7h 45m')
  })

  it('omette i minuti quando sono zero', () => {
    expect(formatHoursMinutes(8)).toBe('8h')
  })

  it('con zero ore non inventa minuti', () => {
    expect(formatHoursMinutes(0)).toBe('0h')
  })

  it('arrotonda al minuto invece di troncare', () => {
    // 7.999 ore sono 479.94 minuti: 8h, non 7h 59m
    expect(formatHoursMinutes(7.999)).toBe('8h')
  })
})

function record(overrides: Partial<PayrollRecord> = {}): PayrollRecord {
  return {
    userId: 'user-1',
    employeeCode: '001',
    firstName: 'Andrea',
    lastName: 'Segatto',
    date: new Date('2026-08-20T00:00:00Z'),
    clockIn: new Date('2026-08-20T07:00:00Z'), // 09:00 italiane
    clockOut: new Date('2026-08-20T15:00:00Z'), // 17:00 italiane
    hours: {
      ordinary: 8,
      overtime: 0,
      night: 0,
      holiday: 0,
      total: 8,
      breakMinutes: 0,
    },
    leaveCode: null,
    notes: [],
    contractType: 'TEMPO_INDETERMINATO',
    contractHoursWeek: 40,
    hourlyRateBase: null,
    hourlyRateExtra: null,
    hourlyRateHoliday: null,
    hourlyRateNight: null,
    workLocationName: null,
    policyName: null,
    // Obbligatorio in `PayrollRecord` e sempre valorizzato dal calcolatore
    // (payroll-calculator.ts:604). Mancava qui perché la factory è più vecchia
    // del campo, e nessuno se n'era accorto: questi file non passavano sotto
    // il compilatore. Zero è il valore vero per un turno senza minuti sospesi;
    // chi vuole provare il caso opposto lo passa fra gli overrides.
    pendingReviewMinutes: 0,
    ...overrides,
  }
}

function summary(overrides: Partial<PayrollSummary> = {}): PayrollSummary {
  return {
    userId: 'user-1',
    employeeCode: '001',
    firstName: 'Andrea',
    lastName: 'Segatto',
    totalOrdinary: 8,
    totalOvertime: 0,
    totalNight: 0,
    totalHoliday: 0,
    totalHours: 8,
    totalLeaveDays: 0,
    leaveSummary: {},
    estimatedCost: 0,
    // Come sopra: obbligatorio in `PayrollSummary`, e non è un dettaglio —
    // «finché non sono zero, niente export» dice il commento sul tipo.
    totalPendingReviewMinutes: 0,
    ...overrides,
  }
}

describe('buildMonthlyTimesheet', () => {
  it('confeziona i giorni del mese con orari italiani leggibili', () => {
    const cartellino = buildMonthlyTimesheet(
      [record()],
      summary(),
      8,
      2026
    )

    expect(cartellino.days).toHaveLength(1)
    expect(cartellino.days[0].date).toBe('2026-08-20')
    expect(cartellino.days[0].weekdayLabel).toBe('giovedì')
    expect(cartellino.days[0].clockIn).toBe('09:00')
    expect(cartellino.days[0].clockOut).toBe('17:00')
    expect(cartellino.totals.total).toBe(8)
    expect(cartellino.contractHoursWeek).toBe(40)
  })

  it('riporta il codice di assenza e il luogo della giornata', () => {
    const cartellino = buildMonthlyTimesheet(
      [
        record({ leaveCode: 'FE', clockIn: null, clockOut: null }),
        record({
          date: new Date('2026-08-21T00:00:00Z'),
          workLocationName: 'Villa Varda',
        }),
      ],
      summary({ totalLeaveDays: 1, leaveSummary: { FE: 1 } }),
      8,
      2026
    )

    expect(cartellino.days[0].leaveCode).toBe('FE')
    expect(cartellino.days[0].clockIn).toBeNull()
    expect(cartellino.days[1].workLocationName).toBe('Villa Varda')
    expect(cartellino.totals.leaveDays).toBe(1)
  })

  it('elenca le regole applicate nel mese, una volta sola', () => {
    const cartellino = buildMonthlyTimesheet(
      [
        record({ policyName: 'Full time' }),
        record({
          date: new Date('2026-08-21T00:00:00Z'),
          policyName: 'Full time',
        }),
        record({
          date: new Date('2026-08-22T00:00:00Z'),
          policyName: 'Orario del bar',
        }),
      ],
      summary(),
      8,
      2026
    )

    expect(cartellino.policyNames).toEqual(['Full time', 'Orario del bar'])
  })

  it('il turno che scavalca la mezzanotte compare una volta sola, nel giorno di inizio', () => {
    // 22:00 -> 03:00 del giorno dopo: l'uscita mostrata è quella riconosciuta,
    // e il giorno successivo resta vuoto
    const cartellino = buildMonthlyTimesheet(
      [
        record({
          date: new Date('2026-08-20T00:00:00Z'),
          clockIn: new Date('2026-08-20T20:00:00Z'), // 22:00 italiane
          clockOut: new Date('2026-08-21T01:00:00Z'), // 03:00 del 21
          hours: {
            ordinary: 0,
            overtime: 0,
            night: 5,
            holiday: 0,
            total: 5,
            breakMinutes: 0,
          },
        }),
        record({
          date: new Date('2026-08-21T00:00:00Z'),
          clockIn: null,
          clockOut: null,
          hours: {
            ordinary: 0,
            overtime: 0,
            night: 0,
            holiday: 0,
            total: 0,
            breakMinutes: 0,
          },
        }),
      ],
      summary({ totalHours: 5, totalNight: 5, totalOrdinary: 0 }),
      8,
      2026
    )

    expect(cartellino.days[0].clockIn).toBe('22:00')
    expect(cartellino.days[0].clockOut).toBe('03:00')
    expect(cartellino.days[0].hours.total).toBe(5)
    expect(cartellino.days[1].hours.total).toBe(0)
    expect(cartellino.days[1].clockIn).toBeNull()
  })
})
