/**
 * Payroll Calculator
 *
 * Calcola le ore lavorate per l'elaborazione delle paghe.
 * Gestisce ore ordinarie, straordinario, notturne e festive.
 */

import { prisma } from '@/lib/prisma'
import { Prisma, PunchType, LeaveStatus } from '@prisma/client'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSunday,
  getHours,
  differenceInMinutes,
  addMinutes,
} from 'date-fns'

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
 * Calcola le ore notturne in un intervallo
 * Le ore notturne sono quelle tra le 22:00 e le 06:00
 */
function calculateNightHours(start: Date, end: Date): number {
  let nightMinutes = 0
  let current = new Date(start)

  while (current < end) {
    const hour = getHours(current)
    // Notturno: 22, 23, 0, 1, 2, 3, 4, 5
    if (hour >= 22 || hour < 6) {
      nightMinutes++
    }
    current = addMinutes(current, 1)
  }

  return nightMinutes / 60
}

/**
 * Calcola le ore lavorate da un set di timbrature
 */
function calculateHoursFromPunches(
  records: AttendanceRecordData[],
  date: Date,
  contractHoursDay: number
): DailyHours {
  // Trova IN e OUT del giorno
  const inRecords = records.filter((r) => r.punchType === 'IN')
  const outRecords = records.filter((r) => r.punchType === 'OUT')
  const breakStartRecords = records.filter((r) => r.punchType === 'BREAK_START')
  const breakEndRecords = records.filter((r) => r.punchType === 'BREAK_END')

  if (inRecords.length === 0 || outRecords.length === 0) {
    return {
      ordinary: 0,
      overtime: 0,
      night: 0,
      holiday: 0,
      total: 0,
      breakMinutes: 0,
    }
  }

  // Primo ingresso e ultima uscita
  const firstIn = new Date(
    Math.min(...inRecords.map((r) => new Date(r.punchedAt).getTime()))
  )
  const lastOut = new Date(
    Math.max(...outRecords.map((r) => new Date(r.punchedAt).getTime()))
  )

  // Calcola minuti totali
  const totalMinutes = differenceInMinutes(lastOut, firstIn)

  // Sottrai pause
  let breakMinutes = 0
  for (let i = 0; i < breakStartRecords.length; i++) {
    const breakStart = breakStartRecords[i]
    // Trova il BREAK_END corrispondente
    const breakEnd = breakEndRecords.find(
      (be) => new Date(be.punchedAt) > new Date(breakStart.punchedAt)
    )
    if (breakEnd) {
      breakMinutes += differenceInMinutes(
        new Date(breakEnd.punchedAt),
        new Date(breakStart.punchedAt)
      )
    }
  }

  const workedMinutes = Math.max(0, totalMinutes - breakMinutes)
  const totalHours = workedMinutes / 60

  // Calcola ore notturne
  const nightHours = calculateNightHours(firstIn, lastOut)

  // Determina se festivo
  const isHoliday = isItalianHoliday(date) || isSunday(date)

  // Calcola straordinario (oltre ore contratto giornaliero)
  const ordinaryHours = Math.min(totalHours, contractHoursDay)
  const overtimeHours = Math.max(0, totalHours - contractHoursDay)

  return {
    ordinary: isHoliday ? 0 : Math.max(0, ordinaryHours - nightHours),
    overtime: isHoliday ? 0 : overtimeHours,
    night: nightHours,
    holiday: isHoliday ? totalHours : 0,
    total: totalHours,
    breakMinutes,
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

  // Periodo
  const startDate = startOfMonth(new Date(year, month - 1))
  const endDate = endOfMonth(new Date(year, month - 1))
  const days = eachDayOfInterval({ start: startDate, end: endDate })

  // Carica dipendenti attivi
  const usersWhere: Prisma.UserWhereInput = {
    isActive: true,
    portalEnabled: true,
  }
  if (venueId) {
    usersWhere.venueId = venueId
  }

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
        gte: startDate,
        lte: endDate,
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
      startDate: { lte: endDate },
      endDate: { gte: startDate },
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
        gte: startDate,
        lte: endDate,
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

  // Organizza timbrature per utente e giorno
  const punchesByUserDay = new Map<string, AttendanceRecordData[]>()
  attendanceRecords.forEach((record) => {
    const dateKey = format(new Date(record.punchedAt), 'yyyy-MM-dd')
    const key = `${record.userId}_${dateKey}`
    if (!punchesByUserDay.has(key)) {
      punchesByUserDay.set(key, [])
    }
    punchesByUserDay.get(key)!.push(record)
  })

  // Organizza assenze per utente e giorno
  const leavesByUserDay = new Map<string, string>()
  leaveRequests.forEach((leave) => {
    const leaveStart = new Date(leave.startDate)
    const leaveEnd = new Date(leave.endDate)
    const leaveDays = eachDayOfInterval({
      start: leaveStart > startDate ? leaveStart : startDate,
      end: leaveEnd < endDate ? leaveEnd : endDate,
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

    // Calcola ore contratto giornaliere (settimanali / 6 giorni)
    const contractHoursDay = user.contractHoursWeek
      ? Number(user.contractHoursWeek) / 6
      : 8

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
        hours = calculateHoursFromPunches(punches, day, contractHoursDay)

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
