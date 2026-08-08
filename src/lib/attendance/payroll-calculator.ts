/**
 * Payroll Calculator
 *
 * Calcola le ore lavorate per l'elaborazione delle paghe.
 * Gestisce ore ordinarie, straordinario, notturne e festive.
 */

import { prisma } from '@/lib/prisma'
import { Prisma, PunchType, LeaveStatus } from '@prisma/client'
import { computeRecognizedDay } from './timekeeping-engine'
import type { DayPunch, PolicyRules, ShiftReview } from './timekeeping-types'
import {
  loadPolicyResolutionContext,
  neutralPolicy,
  resolvePolicyRules,
} from './policy-resolver'
import { dstShiftBetween, groupPunchesByWorkday, toWorkdayMinutes } from './workday'
import {
  nextDateKey,
  romeDayStart,
  romeInstant,
  romeMonthRange,
  timeColumnToMinutes,
  toDateOnlyUtc,
  toRomeParts,
} from '@/lib/timezone'

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

// Pasqua e Lunedì dell'Angelo, come 'MM-dd'. Il calcolo passa da Date.UTC e
// non dal fuso della macchina: su un server a ovest di Greenwich il giorno
// non deve spostarsi.
function getEasterMonthDays(year: number): string[] {
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

  const easter = new Date(Date.UTC(year, month - 1, day))
  const easterMonday = new Date(easter.getTime() + 24 * 60 * 60 * 1000)

  return [
    easter.toISOString().slice(5, 10),
    easterMonday.toISOString().slice(5, 10),
  ]
}

function isItalianHoliday(dateKey: string): boolean {
  const monthDay = dateKey.slice(5)

  if (ITALIAN_HOLIDAYS.includes(monthDay)) {
    return true
  }

  return getEasterMonthDays(Number(dateKey.slice(0, 4))).includes(monthDay)
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
  /** Luogo della giornata (quello della prima timbratura), per il cartellino. */
  workLocationName: string | null
  /** Regola oraria applicata: senza questo nome i numeri sono inspiegabili. */
  policyName: string | null
  /** Minuti oltre il turno sospesi in attesa di revisione: né pagati né persi. */
  pendingReviewMinutes: number
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
  /** Minuti del mese in attesa di revisione: finché non sono zero, niente export. */
  totalPendingReviewMinutes: number
}

interface AttendanceRecordData {
  punchType: PunchType
  punchedAt: Date
  workLocationId?: string | null
  /** 'SYSTEM' per gli orari scritti dalla chiusura automatica. */
  manualEntryBy?: string | null
  /** Valorizzato quando la timbratura nasce da una correzione approvata. */
  correctionRequestId?: string | null
}

/**
 * Da dove viene l'orario, per il motore: una supposizione del sistema cede a
 * una correzione approvata, una timbratura vera non si tocca.
 */
function origineDi(record: AttendanceRecordData): DayPunch['origine'] {
  if (record.correctionRequestId) return 'correzione'
  if (record.manualEntryBy === 'SYSTEM') return 'sistema'
  return undefined
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
  rules: PolicyRules,
  shiftWindows?: { startMinutes: number; endMinutes: number }[],
  shiftReview?: ShiftReview
): {
  hours: DailyHours
  clockInMinutes: number | null
  clockOutMinutes: number | null
  pendingReviewMinutes: number
} {
  const punches: DayPunch[] = records.map((record) => ({
    type: record.punchType as DayPunch['type'],
    minutes: toWorkdayMinutes(record.punchedAt, workdayKey),
    origine: origineDi(record),
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
    isHoliday: isItalianHoliday(workdayKey),
    dstShiftMinutes,
    shiftWindows,
    shiftReview,
  })

  return {
    hours: {
      ordinary: day.ordinaryMinutes / 60,
      overtime: day.overtimeMinutes / 60,
      night: day.nightMinutes / 60,
      holiday: day.holidayMinutes / 60,
      total: day.workedMinutes / 60,
      breakMinutes: day.breakMinutes,
    },
    clockInMinutes: day.clockIn,
    clockOutMinutes: day.clockOut,
    pendingReviewMinutes: day.pendingReviewMinutes,
  }
}

/** Tipi di anomalia la cui decisione entra nel calcolo delle ore. */
const REVIEW_ANOMALY_TYPES = ['EARLY_CLOCK_IN', 'OVERTIME'] as const

/**
 * Le decisioni del revisore per un giorno, dalle anomalie di quel giorno.
 * Finché una è PENDING la decisione non c'è: il motore tiene le ore sospese.
 * Fra più anomalie decise dello stesso tipo prevale il rifiuto: meglio non
 * pagare ore da confermare che pagare ore rifiutate.
 */
function reviewFromAnomalies(
  anomalies: { anomalyType: string; status: string }[]
): ShiftReview {
  const review: ShiftReview = {}

  for (const [tipo, campo] of [
    ['EARLY_CLOCK_IN', 'earlyIn'],
    ['OVERTIME', 'overtime'],
  ] as const) {
    const delTipo = anomalies.filter((a) => a.anomalyType === tipo)
    if (delTipo.length === 0 || delTipo.some((a) => a.status === 'PENDING')) {
      continue
    }
    if (delTipo.some((a) => a.status === 'REJECTED')) {
      review[campo] = 'REJECTED'
    } else if (delTipo.some((a) => a.status === 'APPROVED')) {
      review[campo] = 'APPROVED'
    }
  }

  return review
}

/**
 * Genera i dati payroll per un mese
 */
export async function generatePayrollData(
  month: number,
  year: number,
  venueId?: string,
  options?: { userIds?: string[] }
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

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const dateKeys: string[] = []
  for (let key = `${monthPrefix}-01`; key.startsWith(monthPrefix); key = nextDateKey(key)) {
    dateKeys.push(key)
  }
  const firstKey = dateKeys[0]
  const lastKey = dateKeys[dateKeys.length - 1]
  const firstDay = toDateOnlyUtc(firstKey)
  const lastDay = toDateOnlyUtc(lastKey)

  // Carica dipendenti attivi
  const usersWhere: Prisma.UserWhereInput = {
    isActive: true,
    portalEnabled: true,
  }
  if (venueId) {
    usersWhere.venueId = venueId
  }
  if (options?.userIds?.length) {
    usersWhere.id = { in: options.userIds }
  }

  // Le regole si caricano una volta sola per tutto l'organico: interrogare il
  // database per ogni dipendente moltiplicherebbe le query per il numero di
  // persone.
  const policyContext = venueId ? await loadPolicyResolutionContext(venueId) : null

  // Nomi dei luoghi di lavoro, per mostrare nel cartellino dove si è timbrato.
  const workLocationNames = new Map<string, string>()
  if (venueId) {
    const luoghi = await prisma.workLocation.findMany({
      where: { venueId },
      select: { id: true, name: true },
    })
    for (const luogo of luoghi) {
      workLocationNames.set(luogo.id, luogo.name)
    }
  }

  // Turni pubblicati del mese, ma solo se almeno una regola li usa come
  // finestra della giornata: per tutte le altre sarebbe una query sprecata.
  const qualcunoSegueIlTurno =
    policyContext !== null &&
    (policyContext.defaultPolicy?.useShiftAsWindow === true ||
      [...policyContext.userPolicyByUserId.values()].some((p) => p.useShiftAsWindow) ||
      [...policyContext.locationPolicyByLocationId.values()].some(
        (p) => p.useShiftAsWindow
      ))

  const turniPerUtenteGiorno = new Map<
    string,
    { startMinutes: number; endMinutes: number }[]
  >()
  if (qualcunoSegueIlTurno) {
    const turni = await prisma.shiftAssignment.findMany({
      where: {
        date: { gte: firstDay, lte: lastDay },
        schedule: { status: 'PUBLISHED' },
        ...(venueId && { venueId }),
      },
      select: { userId: true, date: true, startTime: true, endTime: true },
    })

    for (const turno of turni) {
      if (!turno.startTime || !turno.endTime) continue

      const chiave = `${turno.userId}_${turno.date.toISOString().slice(0, 10)}`
      const startMinutes = timeColumnToMinutes(turno.startTime)
      let endMinutes = timeColumnToMinutes(turno.endTime)
      // La fine "prima" dell'inizio è il giorno dopo: il turno serale.
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60
      }

      const lista = turniPerUtenteGiorno.get(chiave)
      if (lista) {
        lista.push({ startMinutes, endMinutes })
      } else {
        turniPerUtenteGiorno.set(chiave, [{ startMinutes, endMinutes }])
      }
    }
  }

  // Carica le timbrature del periodo, più un margine oltre gli estremi: il
  // turno del 31 sera ha l'uscita nel mese dopo, e quello del mese prima ha
  // l'uscita il giorno 1. È il raggruppamento per giornata lavorativa a
  // decidere poi a quale mese appartiene ciascun turno.
  const QUERY_MARGIN_MS = 24 * 60 * 60 * 1000
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      punchedAt: {
        gte: new Date(period.start.getTime() - QUERY_MARGIN_MS),
        lt: new Date(period.end.getTime() + QUERY_MARGIN_MS),
      },
      ...(venueId && { venueId }),
    },
    select: {
      userId: true,
      punchType: true,
      punchedAt: true,
      workLocationId: true,
      // Servono al motore per sapere quale orario è una supposizione del
      // sistema e quale una correzione approvata da un responsabile.
      manualEntryBy: true,
      correctionRequestId: true,
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

  // Gli utenti si caricano DOPO timbrature e assenze, perché chi ha lavorato
  // nel mese deve entrare nell'export anche se oggi non è più attivo.
  //
  // Prima il filtro era `isActive: true, portalEnabled: true` senza nessun
  // criterio di data: chi veniva disattivato il 15 spariva dall'export di quel
  // mese insieme alle due settimane che aveva lavorato — circa 80 ore, 960 €
  // lordi — e non compariva nemmeno con una riga a zero, quindi la sua assenza
  // dall'elenco non saltava all'occhio. Ed è proprio l'ultimo mese, quello del
  // conguaglio, in cui un errore diventa una vertenza. Valeva identicamente
  // per `portalEnabled: false`, la casella che si toglie a chi non deve più
  // accedere: un gesto che sembra innocuo e cancellava le ore dal mese.
  const idsConAttivitaNelMese = [
    ...new Set([
      ...attendanceRecords.map((r) => r.userId),
      ...leaveRequests.map((l) => l.userId),
    ]),
  ]

  usersWhere.OR = [
    { isActive: true, portalEnabled: true },
    ...(idsConAttivitaNelMese.length > 0
      ? [{ id: { in: idsConAttivitaNelMese } }]
      : []),
  ]

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
      isActive: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  // Chi rientra solo perché ha lavorato va segnalato: il consulente deve
  // sapere che quella riga è di una persona che non è più in forza.
  const cessatiConOre = users.filter((u) => !u.isActive)
  cessatiConOre.forEach((u) => {
    warnings.push(
      `${u.lastName} ${u.firstName}: non più attivo, ma ha attività nel mese. ` +
        "Incluso nell'export."
    )
  })

  // Anomalie del mese: le PENDING finiscono nelle note e negli avvisi; per
  // anticipo e straordinario contano anche quelle decise, perché la decisione
  // del revisore entra nel calcolo delle ore (le sospese si pagano solo se
  // approvate, il rifiuto taglia la giornata al turno).
  const monthAnomalies = await prisma.attendanceAnomaly.findMany({
    where: {
      date: {
        gte: firstDay,
        lte: lastDay,
      },
      OR: [
        { status: 'PENDING' },
        {
          anomalyType: { in: [...REVIEW_ANOMALY_TYPES] },
          status: { in: ['APPROVED', 'REJECTED'] },
        },
      ],
      ...(venueId && { venueId }),
    },
    select: {
      userId: true,
      date: true,
      anomalyType: true,
      status: true,
    },
  })
  const unresolvedAnomalies = monthAnomalies.filter((a) => a.status === 'PENDING')

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

  // Organizza assenze per utente e giorno. Le colonne @db.Date arrivano da
  // Prisma come mezzanotti UTC: la chiave del giorno è la loro data ISO, senza
  // passare dal fuso della macchina.
  const leavesByUserDay = new Map<string, string>()
  leaveRequests.forEach((leave) => {
    const startKey = leave.startDate.toISOString().slice(0, 10)
    const endKey = leave.endDate.toISOString().slice(0, 10)
    const stop = endKey < lastKey ? endKey : lastKey

    for (
      let key = startKey > firstKey ? startKey : firstKey;
      key <= stop;
      key = nextDateKey(key)
    ) {
      leavesByUserDay.set(`${leave.userId}_${key}`, leave.leaveType.code)
    }
  })

  // Organizza anomalie per utente e giorno
  const anomaliesByUserDay = new Map<string, string[]>()
  unresolvedAnomalies.forEach((anomaly) => {
    const dateKey = anomaly.date.toISOString().slice(0, 10)
    const key = `${anomaly.userId}_${dateKey}`
    if (!anomaliesByUserDay.has(key)) {
      anomaliesByUserDay.set(key, [])
    }
    anomaliesByUserDay.get(key)!.push(anomaly.anomalyType)
  })

  // Decisioni del revisore per utente e giorno, da passare al motore.
  const reviewAnomaliesByUserDay = new Map<
    string,
    { anomalyType: string; status: string }[]
  >()
  monthAnomalies.forEach((anomaly) => {
    if (!(REVIEW_ANOMALY_TYPES as readonly string[]).includes(anomaly.anomalyType)) {
      return
    }
    const key = `${anomaly.userId}_${anomaly.date.toISOString().slice(0, 10)}`
    const lista = reviewAnomaliesByUserDay.get(key)
    if (lista) {
      lista.push(anomaly)
    } else {
      reviewAnomaliesByUserDay.set(key, [anomaly])
    }
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
      totalPendingReviewMinutes: 0,
    })

    // Regole in vigore per questa persona: quelle del locale se ne impone una,
    // altrimenti le sue, altrimenti la predefinita aziendale. Chi non ne ha
    // nessuna viene calcolato come prima che le regole esistessero.
    const contractWeeklyHours = user.contractHoursWeek
      ? Number(user.contractHoursWeek)
      : null
    // La risoluzione dipende anche dal giorno: una modifica con decorrenza
    // congela i valori precedenti, e i giorni passati usano quelli.
    const regolePerGiornata = (workLocationId: string | null, dateKey: string) =>
      policyContext
        ? resolvePolicyRules(
            policyContext,
            user.id,
            workLocationId,
            contractWeeklyHours,
            dateKey
          )
        : { rules: neutralPolicy(contractWeeklyHours), policyName: null }

    // Processa ogni giorno
    dateKeys.forEach((dateKey) => {
      const day = toDateOnlyUtc(dateKey)
      const key = `${user.id}_${dateKey}`

      const punches = punchesByUserDay.get(key) || []
      const leaveCode = leavesByUserDay.get(key) || null
      const dayAnomalies = anomaliesByUserDay.get(key) || []

      // Note
      const notes: string[] = []
      if (dayAnomalies.length > 0) {
        notes.push(`Anomalie: ${dayAnomalies.join(', ')}`)
        warnings.push(
          `${user.lastName} ${user.firstName}: anomalie non risolte il ` +
            dateKey.split('-').reverse().join('/')
        )
      }

      // Calcola ore
      let hours: DailyHours
      let riconosciuto: {
        clockInMinutes: number | null
        clockOutMinutes: number | null
      } | null = null
      let workLocationName: string | null = null
      let policyName: string | null = null
      let pendingReviewMinutes = 0
      // L'assenza approvata si registra sempre, anche se quel giorno la
      // persona ha lavorato lo stesso: il permesso è stato concesso, ed è un
      // fatto. Quello che NON si può fare è dedurne che non abbia lavorato.
      if (leaveCode) {
        const summary = summariesMap.get(user.id)!
        summary.totalLeaveDays++
        summary.leaveSummary[leaveCode] =
          (summary.leaveSummary[leaveCode] || 0) + 1
      }

      if (punches.length > 0) {
        // Il luogo della giornata è quello della prima timbratura: se una
        // persona si sposta fra i locali nella stessa giornata, vale dove ha
        // iniziato.
        const workLocationId =
          punches.find((p) => p.workLocationId)?.workLocationId ?? null
        workLocationName = workLocationId
          ? (workLocationNames.get(workLocationId) ?? null)
          : null

        const regole = regolePerGiornata(workLocationId, dateKey)
        policyName = regole.policyName

        const risultato = calculateHoursFromPunches(
          punches,
          dateKey,
          regole.rules,
          turniPerUtenteGiorno.get(key),
          reviewFromAnomalies(reviewAnomaliesByUserDay.get(key) ?? [])
        )
        hours = risultato.hours
        riconosciuto = risultato
        pendingReviewMinutes = risultato.pendingReviewMinutes

        if (pendingReviewMinutes > 0) {
          notes.push(`${pendingReviewMinutes} min oltre il turno in attesa di approvazione`)
          warnings.push(
            `${user.lastName} ${user.firstName}: ${pendingReviewMinutes} min oltre il ` +
              `turno in attesa di approvazione il ` +
              dateKey.split('-').reverse().join('/')
          )
        }

        // Permesso approvato e timbrature nello stesso giorno: succede
        // davvero — il collega dà forfait e chi è in permesso viene chiamato.
        // Prima il ramo delle ferie veniva per primo e azzerava tutto senza
        // guardare le timbrature, così il cartellino stampava «entrata 17:00,
        // uscita 23:00, ore 0»: l'orario giusto accanto al totale sbagliato,
        // e nessuna nota che segnalasse la contraddizione.
        //
        // Le ore ora si contano. Quale dei due prevalga — se il permesso vada
        // restituito o le ore pagate come straordinario — è una decisione del
        // titolare e del consulente, non del programma: qui si rende visibile.
        if (leaveCode) {
          notes.push(
            `Permesso ${leaveCode} e timbrature nello stesso giorno: da verificare`
          )
          warnings.push(
            `${user.lastName} ${user.firstName}: giornata con permesso e timbrature ` +
              `il ${dateKey.split('-').reverse().join('/')} ` +
              `(${leaveCode}, ${hours.total.toFixed(2)} ore lavorate): da verificare`
          )
        }

        // Aggiorna summary
        const summary = summariesMap.get(user.id)!
        summary.totalOrdinary += hours.ordinary
        summary.totalOvertime += hours.overtime
        summary.totalNight += hours.night
        summary.totalHoliday += hours.holiday
        summary.totalHours += hours.total
        summary.totalPendingReviewMinutes += pendingReviewMinutes
      } else {
        // Nessuna timbratura: la giornata vale zero ore, che sia un'assenza
        // approvata o un giorno non lavorato.
        hours = {
          ordinary: 0,
          overtime: 0,
          night: 0,
          holiday: 0,
          total: 0,
          breakMinutes: 0,
        }
      }

      // Entrata e uscita del record: quelle riconosciute dal motore, così le
      // colonne dell'export tornano con le ore conteggiate accanto. Quando il
      // motore non riconosce nulla (uscita mancante), resta la timbratura
      // grezza: nasconderla renderebbe invisibile proprio il dato da correggere.
      const inPunches = punches.filter((p) => p.punchType === 'IN')
      const outPunches = punches.filter((p) => p.punchType === 'OUT')

      const rawClockIn =
        inPunches.length > 0
          ? new Date(
              Math.min(
                ...inPunches.map((p) => new Date(p.punchedAt).getTime())
              )
            )
          : null

      const rawClockOut =
        outPunches.length > 0
          ? new Date(
              Math.max(
                ...outPunches.map((p) => new Date(p.punchedAt).getTime())
              )
            )
          : null

      const clockIn =
        riconosciuto?.clockInMinutes != null
          ? romeInstant(dateKey, riconosciuto.clockInMinutes)
          : rawClockIn

      const clockOut =
        riconosciuto?.clockOutMinutes != null
          ? romeInstant(dateKey, riconosciuto.clockOutMinutes)
          : rawClockOut

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
        workLocationName,
        policyName,
        pendingReviewMinutes,
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
