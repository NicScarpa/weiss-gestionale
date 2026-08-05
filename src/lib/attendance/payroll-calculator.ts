/**
 * Payroll Calculator
 *
 * Calcola le ore lavorate per l'elaborazione delle paghe.
 * Gestisce ore ordinarie, straordinario, notturne e festive.
 */

import { prisma } from '@/lib/prisma'
import { Prisma, PunchType, LeaveStatus } from '@prisma/client'
import { format, eachDayOfInterval } from 'date-fns'
import { computeRecognizedDay } from './timekeeping-engine'
import type { DayPunch, PolicyRules } from './timekeeping-types'
import {
  loadPolicyResolutionContext,
  neutralPolicy,
  resolvePolicyRules,
} from './policy-resolver'
import { dstShiftBetween, groupPunchesByWorkday, toWorkdayMinutes } from './workday'
import { romeDayStart, romeMonthRange, toRomeParts } from '@/lib/timezone'

// Festività italiane fisse
const ITALIAN_HOLIDAYS = [
  '01-01', // Capodanno
  '01-06', // Epifania
  '04-25', // Liberazione
  '05-01', // Festa del lavoro
  '06-02', // Festa della Repubblica
  '08-15', // Ferragosto
  '11-01', // Ognissanti
  '12-08', // Immacolata
  '12-25', // Natale
  '12-26', // Santo Stefano
]

// Pasqua e Lunedì dell'Angelo (calcolati per anno)
function getEasterDates(year: number): string[] {
  // Algoritmo di Gauss per calcolo Pasqua
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  const easter = new Date(year, month - 1, day)
  const easterMonday = new Date(easter)
  easterMonday.setDate(easter.getDate() + 1)

  return [
    format(easter, 'MM-dd'),
    format(easterMonday, 'MM-dd'),
  ]
}

function isItalianHoliday(date: Date): boolean {
  const monthDay = format(date, 'MM-dd')
  const year = date.getFullYear()

  // Controlla festività fisse
  if (ITALIAN_HOLIDAYS.includes(monthDay)) {
    return true
  }

  // Controlla Pasqua e Pasquetta
  const easterDates = getEasterDates(year)
  return easterDates.includes(monthDay)
}

export interface DailyHours {
  ordinary: number        // Ore ordinarie
  overtime: number        // Straordinario
  night: number           // Notturne (22:00-06:00)
  holiday: number         // Festive
  total: number           // Totale ore lavorate
  breakMinutes: number    // Minuti di pausa
}

export interface PayrollRecord {
  userId: string
  employeeCode: string     // Matricola (generata da posizione)
  firstName: string
  lastName: string
  date: Date
  clockIn: Date | null
  clockOut: Date | null
  hours: DailyHours
  leaveCode: string | null // FE, MA, ROL, etc.
  notes: string[]
  contractType: string | null
  contractHoursWeek: number | null
  hourlyRateBase: number | null
  hourlyRateExtra: number | null
  hourlyRateHoliday: number | null
  hourlyRateNight: number | null
}

export interface PayrollSummary {
  userId: string
  employeeCode: string
  firstName: string
  lastName: string
  totalOrdinary: number
  totalOvertime: number
  totalNight: number
  totalHoliday: number
  totalHours: number
  totalLeaveDays: number
  leaveSummary: Record<string, number> // FE: 2, MA: 1, etc.
  estimatedCost: number
}

interface AttendanceRecordData {
  punchType: PunchType
  punchedAt: Date
}

/**
 * Ore di una giornata, applicando le regole orario in vigore.
 *
 * Il calcolo vero sta nel motore (`timekeeping-engine.ts`), che è puro e
 * testato: qui si traducono le timbrature in minuti della giornata lavorativa,
 * si chiama il motore e si riportano i minuti in ore.
 */
function calculateHoursFromPunches(
  records: AttendanceRecordData[],
  workdayKey: string,
  date: Date,
  rules: PolicyRules
): DailyHours {
  const punches: DayPunch[] = records.map((record) => ({
    type: record.punchType as DayPunch['type'],
    minutes: toWorkdayMinutes(record.punchedAt, workdayKey),
  }))

  const sorted = [...records].sort(
    (a, b) => a.punchedAt.getTime() - b.punchedAt.getTime()
  )
  const dstShiftMinutes =
    sorted.length > 1
      ? dstShiftBetween(sorted[0].punchedAt, sorted[sorted.length - 1].punchedAt)
      : 0

  const day = computeRecognizedDay(punches, rules, {
    weekday: toRomeParts(romeDayStart(workdayKey)).weekday,
    isHoliday: isItalianHoliday(date),
    dstShiftMinutes,
  })

  return {
    ordinary: day.ordinaryMinutes / 60,
    overtime: day.overtimeMinutes / 60,
    night: day.nightMinutes / 60,
    holiday: day.holidayMinutes / 60,
    total: day.workedMinutes / 60,
    breakMinutes: day.breakMinutes,
  }
}

/**
 * Genera i dati payroll per un mese
 */
export async function generatePayrollData(
  month: number,
  year: number,
  venueId?: string
): Promise<{
  records: PayrollRecord[]
  summaries: PayrollSummary[]
  warnings: string[]
}> {
  const warnings: string[] = []

  // Periodo. Due rappresentazioni, perché servono a due cose diverse:
  // gli istanti delimitano le timbrature (colonna timestamp), le date pure
  // delimitano assenze e anomalie (colonne @db.Date) e scandiscono i giorni.
  const period = romeMonthRange(year, month)
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(Date.UTC(year, month, 0))
  const days = eachDayOfInterval({ start: firstDay, end: lastDay })

  // Carica dipendenti attivi
  const usersWhere: Prisma.UserWhereInput = {
    isActive: true,
    portalEnabled: true,
  }
  if (venueId) {
    usersWhere.venueId = venueId
  }

  // Le regole si caricano una volta sola per tutto l'organico: interrogare il
  // database per ogni dipendente moltiplicherebbe le query per il numero di
  // persone.
  const policyContext = venueId ? await loadPolicyResolutionContext(venueId) : null

  const users = await prisma.user.findMany({
    where: usersWhere,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      contractType: true,
      contractHoursWeek: true,
      hourlyRateBase: true,
      hourlyRateExtra: true,
      hourlyRateHoliday: true,
      hourlyRateNight: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  // Carica tutte le timbrature del periodo
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      punchedAt: {
        gte: period.start,
        lt: period.end,
      },
      ...(venueId && { venueId }),
    },
    select: {
      userId: true,
      punchType: true,
      punchedAt: true,
    },
    orderBy: { punchedAt: 'asc' },
  })

  // Carica assenze approvate del periodo
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      status: LeaveStatus.APPROVED,
      startDate: { lte: lastDay },
      endDate: { gte: firstDay },
    },
    include: {
      leaveType: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  })

  // Carica anomalie non risolte
  const unresolvedAnomalies = await prisma.attendanceAnomaly.findMany({
    where: {
      date: {
        gte: firstDay,
        lte: lastDay,
      },
      status: 'PENDING',
      ...(venueId && { venueId }),
    },
    select: {
      userId: true,
      date: true,
      anomalyType: true,
    },
  })

  // Organizza le timbrature per utente e giornata lavorativa. Non per giorno
  // civile: un turno che finisce dopo la mezzanotte appartiene per intero al
  // giorno in cui è iniziato.
  const punchesByUser = new Map<string, AttendanceRecordData[]>()
  attendanceRecords.forEach((record) => {
    const list = punchesByUser.get(record.userId)
    if (list) {
      list.push(record)
    } else {
      punchesByUser.set(record.userId, [record])
    }
  })

  const punchesByUserDay = new Map<string, AttendanceRecordData[]>()
  punchesByUser.forEach((userPunches, userId) => {
    groupPunchesByWorkday(userPunches).forEach((dayPunches, dateKey) => {
      punchesByUserDay.set(`${userId}_${dateKey}`, dayPunches)
    })
  })

  // Organizza assenze per utente e giorno
  const leavesByUserDay = new Map<string, string>()
  leaveRequests.forEach((leave) => {
    const leaveStart = new Date(leave.startDate)
    const leaveEnd = new Date(leave.endDate)
    const leaveDays = eachDayOfInterval({
      start: leaveStart > firstDay ? leaveStart : firstDay,
      end: leaveEnd < lastDay ? leaveEnd : lastDay,
    })
    leaveDays.forEach((day) => {
      const key = `${leave.userId}_${format(day, 'yyyy-MM-dd')}`
      leavesByUserDay.set(key, leave.leaveType.code)
    })
  })

  // Organizza anomalie per utente e giorno
  const anomaliesByUserDay = new Map<string, string[]>()
  unresolvedAnomalies.forEach((anomaly) => {
    const dateKey = format(new Date(anomaly.date), 'yyyy-MM-dd')
    const key = `${anomaly.userId}_${dateKey}`
    if (!anomaliesByUserDay.has(key)) {
      anomaliesByUserDay.set(key, [])
    }
    anomaliesByUserDay.get(key)!.push(anomaly.anomalyType)
  })

  // Genera record giornalieri
  const records: PayrollRecord[] = []
  const summariesMap = new Map<string, PayrollSummary>()

  users.forEach((user, index) => {
    // Genera matricola da indice (formato 3 cifre)
    const employeeCode = String(index + 1).padStart(3, '0')

    // Inizializza summary
    summariesMap.set(user.id, {
      userId: user.id,
      employeeCode,
      firstName: user.firstName,
      lastName: user.lastName,
      totalOrdinary: 0,
      totalOvertime: 0,
      totalNight: 0,
      totalHoliday: 0,
      totalHours: 0,
      totalLeaveDays: 0,
      leaveSummary: {},
      estimatedCost: 0,
    })

    // Regole in vigore per questa persona: quelle del locale se ne impone una,
    // altrimenti le sue, altrimenti la predefinita aziendale. Chi non ne ha
    // nessuna viene calcolato come prima che le regole esistessero.
    const contractWeeklyHours = user.contractHoursWeek
      ? Number(user.contractHoursWeek)
      : null
    const { rules } = policyContext
      ? resolvePolicyRules(policyContext, user.id, contractWeeklyHours)
      : { rules: neutralPolicy(contractWeeklyHours) }

    // Processa ogni giorno
    days.forEach((day) => {
      const dateKey = format(day, 'yyyy-MM-dd')
      const key = `${user.id}_${dateKey}`

      const punches = punchesByUserDay.get(key) || []
      const leaveCode = leavesByUserDay.get(key) || null
      const dayAnomalies = anomaliesByUserDay.get(key) || []

      // Note
      const notes: string[] = []
      if (dayAnomalies.length > 0) {
        notes.push(`Anomalie: ${dayAnomalies.join(', ')}`)
        warnings.push(
          `${user.lastName} ${user.firstName}: anomalie non risolte il ${format(day, 'dd/MM/yyyy')}`
        )
      }

      // Calcola ore
      let hours: DailyHours
      if (leaveCode) {
        // Giorno di assenza
        hours = {
          ordinary: 0,
          overtime: 0,
          night: 0,
          holiday: 0,
          total: 0,
          breakMinutes: 0,
        }

        // Aggiorna summary assenze
        const summary = summariesMap.get(user.id)!
        summary.totalLeaveDays++
        summary.leaveSummary[leaveCode] =
          (summary.leaveSummary[leaveCode] || 0) + 1
      } else if (punches.length > 0) {
        hours = calculateHoursFromPunches(punches, dateKey, day, rules)

        // Aggiorna summary
        const summary = summariesMap.get(user.id)!
        summary.totalOrdinary += hours.ordinary
        summary.totalOvertime += hours.overtime
        summary.totalNight += hours.night
        summary.totalHoliday += hours.holiday
        summary.totalHours += hours.total
      } else {
        // Nessuna timbratura e nessuna assenza
        hours = {
          ordinary: 0,
          overtime: 0,
          night: 0,
          holiday: 0,
          total: 0,
          breakMinutes: 0,
        }
      }

      // Trova prima entrata e ultima uscita per il record
      const inPunches = punches.filter((p) => p.punchType === 'IN')
      const outPunches = punches.filter((p) => p.punchType === 'OUT')

      const clockIn =
        inPunches.length > 0
          ? new Date(
              Math.min(
                ...inPunches.map((p) => new Date(p.punchedAt).getTime())
              )
            )
          : null

      const clockOut =
        outPunches.length > 0
          ? new Date(
              Math.max(
                ...outPunches.map((p) => new Date(p.punchedAt).getTime())
              )
            )
          : null

      records.push({
        userId: user.id,
        employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        date: day,
        clockIn,
        clockOut,
        hours,
        leaveCode,
        notes,
        contractType: user.contractType,
        contractHoursWeek: user.contractHoursWeek
          ? Number(user.contractHoursWeek)
          : null,
        hourlyRateBase: user.hourlyRateBase
          ? Number(user.hourlyRateBase)
          : null,
        hourlyRateExtra: user.hourlyRateExtra
          ? Number(user.hourlyRateExtra)
          : null,
        hourlyRateHoliday: user.hourlyRateHoliday
          ? Number(user.hourlyRateHoliday)
          : null,
        hourlyRateNight: user.hourlyRateNight
          ? Number(user.hourlyRateNight)
          : null,
      })
    })

    // Calcola costo stimato
    const summary = summariesMap.get(user.id)!
    const rateBase = user.hourlyRateBase ? Number(user.hourlyRateBase) : 0
    const rateExtra = user.hourlyRateExtra
      ? Number(user.hourlyRateExtra)
      : rateBase * 1.25
    const rateHoliday = user.hourlyRateHoliday
      ? Number(user.hourlyRateHoliday)
      : rateBase * 1.5
    const rateNight = user.hourlyRateNight
      ? Number(user.hourlyRateNight)
      : rateBase * 1.15

    summary.estimatedCost =
      summary.totalOrdinary * rateBase +
      summary.totalOvertime * rateExtra +
      summary.totalHoliday * rateHoliday +
      summary.totalNight * rateNight
  })

  return {
    records,
    summaries: Array.from(summariesMap.values()),
    warnings,
  }
}
