import type { DayContext, DayPunch, PolicyRules } from '../timekeeping-types'

/** Minuti dalla mezzanotte, per scrivere gli orari in modo leggibile nei test. */
export function at(hours: number, minutes = 0): number {
  return hours * 60 + minutes
}

/**
 * Regola di riferimento: giornata 09:00-18:00, pausa pranzo 13:00-14:00,
 * nessun arrotondamento e nessuna flessibilità. I test attivano un pezzo alla
 * volta, così si vede quale parametro produce quale effetto.
 */
export function makePolicy(overrides: Partial<PolicyRules> = {}): PolicyRules {
  return {
    dayStartMinutes: at(9),
    dayEndMinutes: at(18),
    lunch: { startMinutes: at(13), endMinutes: at(14) },
    extraBreaks: [],
    flexMinutes: 0,
    entryRounding: { intervalMinutes: 1, toleranceMinutes: 0 },
    exitRounding: { intervalMinutes: 1, toleranceMinutes: 0 },
    maxDailyMinutes: null,
    contractDailyMinutes: at(8),
    saturdayAsOvertime: false,
    singlePunchMode: false,
    useShiftAsWindow: false,
    ...overrides,
  }
}

/** Un mercoledì feriale qualunque. */
export function makeContext(overrides: Partial<DayContext> = {}): DayContext {
  return { weekday: 3, isHoliday: false, ...overrides }
}

export function punch(type: DayPunch['type'], minutes: number): DayPunch {
  return { type, minutes }
}

export function inAt(minutes: number): DayPunch {
  return punch('IN', minutes)
}

export function outAt(minutes: number): DayPunch {
  return punch('OUT', minutes)
}

/** Uscita scritta dalla chiusura automatica, non dal dipendente. */
export function outDiSistema(minutes: number): DayPunch {
  return { type: 'OUT', minutes, origine: 'sistema' }
}

/** Uscita nata da una richiesta di correzione approvata. */
export function outCorretta(minutes: number): DayPunch {
  return { type: 'OUT', minutes, origine: 'correzione' }
}
