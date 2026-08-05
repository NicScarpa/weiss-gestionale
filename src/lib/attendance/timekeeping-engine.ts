import type {
  DayContext,
  DayPunch,
  DayWarning,
  PolicyRules,
  RecognizedDay,
  TimeRounding,
} from './timekeeping-types'

/**
 * Motore di calcolo delle ore riconosciute.
 *
 * Funzioni pure: nessun accesso al database, nessun `new Date()`, nessuna
 * lettura del fuso. Prendono le timbrature di una giornata espresse in minuti
 * dalla mezzanotte italiana e la regola da applicare, e restituiscono le ore
 * riconosciute con la traccia di come ci si è arrivati.
 *
 * La traccia non è un lusso: una regola con cinque parametri di arrotondamento
 * è impossibile da verificare a occhio, e il calcolatore di prova
 * dell'interfaccia mostra proprio questi passaggi.
 */

const DAY_MINUTES = 24 * 60
const NIGHT_START = 22 * 60
const NIGHT_END = 6 * 60

/**
 * Arrotondamento dell'entrata, verso l'orario successivo.
 * Entro la tolleranza dal confine precedente l'orario resta esatto: con
 * intervallo 30 e tolleranza 5, le 9:03 restano 9:03 e le 9:06 diventano 9:30.
 */
export function roundEntry(minutes: number, rounding: TimeRounding): number {
  const { intervalMinutes, toleranceMinutes } = rounding
  if (intervalMinutes <= 1) {
    return minutes
  }

  const past = minutes % intervalMinutes
  if (past === 0 || past <= toleranceMinutes) {
    return minutes
  }

  return minutes - past + intervalMinutes
}

/**
 * Arrotondamento dell'uscita, verso l'orario precedente.
 * Entro la tolleranza oltre il confine i minuti non vengono tagliati.
 */
export function roundExit(minutes: number, rounding: TimeRounding): number {
  const { intervalMinutes, toleranceMinutes } = rounding
  if (intervalMinutes <= 1) {
    return minutes
  }

  const past = minutes % intervalMinutes
  if (past === 0 || past <= toleranceMinutes) {
    return minutes
  }

  return minutes - past
}

/** Minuti dell'intervallo che cadono in fascia notturna (22:00-06:00). */
export function nightMinutesIn(startMinutes: number, endMinutes: number): number {
  if (endMinutes <= startMinutes) {
    return 0
  }

  let total = 0
  const firstDay = Math.floor(startMinutes / DAY_MINUTES) - 1
  const lastDay = Math.floor(endMinutes / DAY_MINUTES)

  for (let day = firstDay; day <= lastDay; day++) {
    const offset = day * DAY_MINUTES
    total += overlap(
      startMinutes,
      endMinutes,
      offset + NIGHT_START,
      offset + DAY_MINUTES + NIGHT_END
    )
  }

  return total
}

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB))
}

/**
 * Fine della giornata lavorativa, che può cadere dopo la mezzanotte.
 * Null quando la regola non definisce una finestra.
 */
function dayEndOf(policy: PolicyRules): number | null {
  if (policy.dayStartMinutes === null || policy.dayEndMinutes === null) {
    return null
  }

  return policy.dayEndMinutes <= policy.dayStartMinutes
    ? policy.dayEndMinutes + DAY_MINUTES
    : policy.dayEndMinutes
}

function formatMinutes(minutes: number): string {
  const normalized = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const h = Math.floor(normalized / 60)
  const m = normalized % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function emptyDay(warnings: DayWarning[], steps: string[]): RecognizedDay {
  return {
    clockIn: null,
    clockOut: null,
    workedMinutes: 0,
    ordinaryMinutes: 0,
    overtimeMinutes: 0,
    nightMinutes: 0,
    holidayMinutes: 0,
    breakMinutes: 0,
    cappedMinutes: 0,
    steps,
    warnings,
  }
}

/**
 * Ore riconosciute per una giornata lavorativa.
 *
 * L'ordine dei passaggi conta: prima la finestra della giornata con la
 * flessibilità, poi gli arrotondamenti, poi le pause, poi il tetto giornaliero,
 * infine la classificazione. Invertirli darebbe risultati diversi.
 */
export function computeRecognizedDay(
  punches: DayPunch[],
  policy: PolicyRules,
  context: DayContext
): RecognizedDay {
  const steps: string[] = []
  const warnings: DayWarning[] = []

  const ordered = [...punches].sort((a, b) => a.minutes - b.minutes)
  const first = ordered.find((p) => p.type === 'IN')
  const last = [...ordered].reverse().find((p) => p.type === 'OUT')

  if (!first) {
    warnings.push('ENTRATA_MANCANTE')
    return emptyDay(warnings, ['Nessuna entrata registrata.'])
  }

  const dayStart = policy.dayStartMinutes
  const dayEnd = dayEndOf(policy)

  // In modalità timbratura singola l'uscita non esiste: vale la fine giornata.
  let rawOut: number
  if (last) {
    rawOut = last.minutes
  } else if (policy.singlePunchMode && dayEnd !== null) {
    rawOut = dayEnd
    steps.push(
      `Timbratura singola: la giornata si chiude d'ufficio alle ${formatMinutes(dayEnd)}.`
    )
  } else {
    warnings.push('USCITA_MANCANTE')
    return emptyDay(warnings, ['Entrata senza uscita: nessuna ora riconosciuta.'])
  }

  const rawIn = first.minutes
  steps.push(
    `Timbrature: entrata ${formatMinutes(rawIn)}, uscita ${formatMinutes(rawOut)}.`
  )

  if (rawOut <= rawIn) {
    warnings.push('FUORI_FINESTRA')
    return emptyDay(warnings, [...steps, "L'uscita precede l'entrata: nessuna ora riconosciuta."])
  }

  // Finestra della giornata, allargata dalla flessibilità. Se la regola non ne
  // definisce una, si contano le ore così come sono state timbrate.
  const hasWindow = dayStart !== null && dayEnd !== null
  const windowStart = hasWindow ? dayStart! - policy.flexMinutes : rawIn
  const windowEnd = hasWindow ? dayEnd! + policy.flexMinutes : rawOut

  let effectiveIn = Math.max(rawIn, windowStart)
  let effectiveOut = Math.min(rawOut, windowEnd)

  if (effectiveIn !== rawIn || effectiveOut !== rawOut) {
    warnings.push('FUORI_FINESTRA')
    steps.push(
      `Finestra della giornata con flessibilità di ${policy.flexMinutes} min: ` +
        `si conta da ${formatMinutes(effectiveIn)} a ${formatMinutes(effectiveOut)}.`
    )
  }

  if (effectiveOut <= effectiveIn) {
    return emptyDay(warnings, [...steps, 'Nessuna ora dentro la finestra della giornata.'])
  }

  // Arrotondamenti.
  const roundedIn = roundEntry(effectiveIn, policy.entryRounding)
  const roundedOut = roundExit(effectiveOut, policy.exitRounding)

  if (roundedIn !== effectiveIn) {
    steps.push(
      `Arrotondamento entrata: ${formatMinutes(effectiveIn)} diventa ${formatMinutes(roundedIn)}.`
    )
  }
  if (roundedOut !== effectiveOut) {
    steps.push(
      `Arrotondamento uscita: ${formatMinutes(effectiveOut)} diventa ${formatMinutes(roundedOut)}.`
    )
  }

  effectiveIn = roundedIn
  effectiveOut = Math.max(roundedOut, roundedIn)

  const grossMinutes = effectiveOut - effectiveIn

  // Pause.
  const punchedBreaks = collectPunchedBreaks(ordered, effectiveIn, effectiveOut)
  let breakMinutes = punchedBreaks.minutes
  if (punchedBreaks.minutes > 0) {
    steps.push(`Pause timbrate: ${punchedBreaks.minutes} min.`)
  }

  if (policy.lunch && !punchedBreaks.coversLunch) {
    const lunchMinutes = overlap(
      effectiveIn,
      effectiveOut,
      policy.lunch.startMinutes,
      policy.lunch.endMinutes
    )
    if (lunchMinutes > 0) {
      breakMinutes += lunchMinutes
      warnings.push('PAUSA_PRANZO_NON_TIMBRATA')
      steps.push(`Pausa pranzo non timbrata: dedotti ${lunchMinutes} min dalla regola.`)
    }
  }

  for (const extra of policy.extraBreaks) {
    const extraMinutes = overlap(
      effectiveIn,
      effectiveOut,
      extra.startMinutes,
      extra.endMinutes
    )
    if (extraMinutes > 0) {
      breakMinutes += extraMinutes
      steps.push(`Pausa "${extra.name}": dedotti ${extraMinutes} min.`)
    }
  }

  // Lo scarto dell'ora legale si toglie qui: l'ora che il 29 marzo non è mai
  // esistita non va pagata, quella che il 25 ottobre si ripete sì.
  const dstShift = context.dstShiftMinutes ?? 0
  if (dstShift !== 0) {
    steps.push(
      dstShift > 0
        ? `Cambio d'ora: l'orologio è andato avanti di ${dstShift} min, che non sono lavoro.`
        : `Cambio d'ora: l'orologio è tornato indietro di ${-dstShift} min, lavorati davvero.`
    )
  }

  let workedMinutes = Math.max(0, grossMinutes - breakMinutes - dstShift)

  // Tetto giornaliero.
  let cappedMinutes = 0
  if (policy.maxDailyMinutes !== null && workedMinutes > policy.maxDailyMinutes) {
    cappedMinutes = workedMinutes - policy.maxDailyMinutes
    workedMinutes = policy.maxDailyMinutes
    warnings.push('OLTRE_TETTO_GIORNALIERO')
    steps.push(`Tetto giornaliero: non conteggiati ${cappedMinutes} min.`)
  }

  // Ore notturne, in proporzione alla parte di intervallo effettivamente
  // lavorata: le pause riducono le ore, non solo quelle diurne. Il salto
  // dell'ora legale avviene fra le 02:00 e le 03:00, quindi sempre dentro la
  // fascia notturna, e va scontato anche qui.
  const nightClockMinutes = Math.max(
    0,
    nightMinutesIn(effectiveIn, effectiveOut) - dstShift
  )
  const netGrossMinutes = Math.max(0, grossMinutes - dstShift)
  const nightMinutes =
    netGrossMinutes > 0
      ? Math.round((nightClockMinutes * workedMinutes) / netGrossMinutes)
      : 0

  // Classificazione.
  const isHoliday = context.isHoliday || context.weekday === 0
  const isSaturdayOvertime = policy.saturdayAsOvertime && context.weekday === 6

  let ordinaryMinutes = 0
  let overtimeMinutes = 0
  let holidayMinutes = 0

  if (isHoliday) {
    holidayMinutes = workedMinutes
    steps.push('Giorno festivo: tutte le ore sono festive.')
  } else if (isSaturdayOvertime) {
    overtimeMinutes = workedMinutes
    steps.push('Sabato conteggiato interamente come straordinario.')
  } else {
    const contract = policy.contractDailyMinutes ?? workedMinutes
    const withinContract = Math.min(workedMinutes, contract)
    overtimeMinutes = Math.max(0, workedMinutes - contract)
    // Le notturne si scorporano dalle ordinarie: sommate danno il totale.
    ordinaryMinutes = Math.max(0, withinContract - nightMinutes)
  }

  steps.push(
    `Ore riconosciute: ${formatMinutes(workedMinutes)} ` +
      `(${workedMinutes} min, di cui ${nightMinutes} notturni).`
  )

  return {
    clockIn: effectiveIn,
    clockOut: effectiveOut,
    workedMinutes,
    ordinaryMinutes,
    overtimeMinutes,
    nightMinutes,
    holidayMinutes,
    breakMinutes,
    cappedMinutes,
    steps,
    warnings,
  }
}

/**
 * Pause effettivamente timbrate, limitate alla parte dentro l'orario di lavoro.
 * Segnala anche se coprono la pausa pranzo prevista, per non dedurla due volte.
 */
function collectPunchedBreaks(
  ordered: DayPunch[],
  from: number,
  to: number
): { minutes: number; coversLunch: boolean } {
  let minutes = 0
  let coversLunch = false
  let openBreak: number | null = null

  for (const punch of ordered) {
    if (punch.type === 'BREAK_START') {
      openBreak = punch.minutes
    } else if (punch.type === 'BREAK_END' && openBreak !== null) {
      const clipped = overlap(from, to, openBreak, punch.minutes)
      if (clipped > 0) {
        minutes += clipped
        coversLunch = true
      }
      openBreak = null
    }
  }

  return { minutes, coversLunch }
}
