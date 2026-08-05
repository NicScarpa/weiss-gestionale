import {
  generatePayrollData,
  type DailyHours,
  type PayrollRecord,
  type PayrollSummary,
} from './payroll-calculator'
import { romeTimeString } from '@/lib/timezone'

/**
 * Il cartellino mensile: i giorni di una persona con orari riconosciuti,
 * ore per tipo, assenze e anomalie, più i totali del mese.
 *
 * Non calcola nulla: il calcolo vive in `payroll-calculator` e nel motore
 * delle regole. Qui si confeziona il risultato in una forma leggibile — che è
 * la stessa per la pagina admin, la scheda dipendente e il portale, così i
 * tre posti non possono raccontare tre storie diverse.
 */

export interface TimesheetDay {
  /** Giorno 'yyyy-MM-dd'. */
  date: string
  weekdayLabel: string
  /** Orari italiani 'HH:mm' riconosciuti dal motore, null se assenti. */
  clockIn: string | null
  clockOut: string | null
  hours: DailyHours
  leaveCode: string | null
  workLocationName: string | null
  policyName: string | null
  /** Note del giorno, incluse le anomalie non risolte. */
  notes: string[]
}

export interface MonthlyTimesheet {
  userId: string
  firstName: string
  lastName: string
  month: number
  year: number
  days: TimesheetDay[]
  totals: {
    ordinary: number
    overtime: number
    night: number
    holiday: number
    total: number
    leaveDays: number
    leaveSummary: Record<string, number>
  }
  contractHoursWeek: number | null
  /** Regole orario applicate nel mese, senza ripetizioni. */
  policyNames: string[]
}

const WEEKDAYS_IT = [
  'domenica',
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
]

export { formatHoursMinutes } from './format-hours'

/** Confeziona il cartellino dai record payroll di una sola persona. Pura. */
export function buildMonthlyTimesheet(
  records: PayrollRecord[],
  summary: PayrollSummary | null,
  month: number,
  year: number
): MonthlyTimesheet {
  const days: TimesheetDay[] = records.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    weekdayLabel: WEEKDAYS_IT[r.date.getUTCDay()],
    clockIn: r.clockIn ? romeTimeString(new Date(r.clockIn)) : null,
    clockOut: r.clockOut ? romeTimeString(new Date(r.clockOut)) : null,
    hours: r.hours,
    leaveCode: r.leaveCode,
    workLocationName: r.workLocationName,
    policyName: r.policyName,
    notes: r.notes,
  }))

  const policyNames = [
    ...new Set(
      records
        .map((r) => r.policyName)
        .filter((name): name is string => name !== null)
    ),
  ]

  const chi = summary ?? records[0]

  return {
    userId: chi?.userId ?? '',
    firstName: chi?.firstName ?? '',
    lastName: chi?.lastName ?? '',
    month,
    year,
    days,
    totals: {
      ordinary: summary?.totalOrdinary ?? 0,
      overtime: summary?.totalOvertime ?? 0,
      night: summary?.totalNight ?? 0,
      holiday: summary?.totalHoliday ?? 0,
      total: summary?.totalHours ?? 0,
      leaveDays: summary?.totalLeaveDays ?? 0,
      leaveSummary: summary?.leaveSummary ?? {},
    },
    contractHoursWeek: records[0]?.contractHoursWeek ?? null,
    policyNames,
  }
}

/**
 * Il cartellino di una persona per un mese. Null se la persona non esiste o
 * non è fra i dipendenti attivi con accesso al portale.
 */
export async function getMonthlyTimesheet(
  userId: string,
  month: number,
  year: number,
  venueId?: string
): Promise<MonthlyTimesheet | null> {
  const { records, summaries } = await generatePayrollData(month, year, venueId, {
    userIds: [userId],
  })

  const userRecords = records.filter((r) => r.userId === userId)
  if (userRecords.length === 0) {
    return null
  }

  const summary = summaries.find((s) => s.userId === userId) ?? null

  return buildMonthlyTimesheet(userRecords, summary, month, year)
}
