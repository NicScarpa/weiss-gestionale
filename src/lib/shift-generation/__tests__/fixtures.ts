/**
 * Fixture condivise per i test della generazione turni.
 *
 * Le date sono costruite in fuso locale: il solver ragiona sempre in locale
 * (`getHours()`, `formatDateKey()`), usare stringhe ISO con `Z` sposterebbe i
 * giorni e renderebbe i test dipendenti dal fuso della macchina.
 */

import type {
  Employee,
  EmployeeConstraint,
  RelationshipConstraint,
  ShiftAssignment,
  ShiftDefinition,
  ConstraintType,
  RelConstraintType,
} from '../types'

export const VENUE_ID = 'venue-1'

/** Lunedì 5 gennaio 2026: inizio della settimana usata nei test */
export const MONDAY = new Date(2026, 0, 5)

/** Giorno della settimana di test, con offset 0 = lunedì */
export function day(offset: number): Date {
  const d = new Date(MONDAY)
  d.setDate(d.getDate() + offset)
  return d
}

/** I sette giorni della settimana di test */
export const WEEK_DAYS = Array.from({ length: 7 }, (_, i) => day(i))

/** Orario del giorno, come lo restituisce Prisma per una colonna Time */
export function time(hours: number, minutes = 0): Date {
  return new Date(1970, 0, 1, hours, minutes, 0, 0)
}

export function makeShift(overrides: Partial<ShiftDefinition> = {}): ShiftDefinition {
  return {
    id: 'shift-morning',
    venueId: VENUE_ID,
    name: 'Mattina',
    code: 'MAT',
    color: null,
    startTime: time(6),
    endTime: time(14),
    breakMinutes: 0,
    minStaff: 1,
    maxStaff: null,
    requiredSkills: [],
    rateMultiplier: 1,
    position: 1,
    ...overrides,
  }
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    firstName: 'Mario',
    lastName: 'Rossi',
    isFixedStaff: true,
    contractType: 'TEMPO_INDETERMINATO',
    contractHoursWeek: 40,
    venueId: VENUE_ID,
    skills: [],
    canWorkAlone: true,
    canHandleCash: true,
    hourlyRateBase: 12,
    hourlyRateExtra: null,
    hourlyRateHoliday: null,
    hourlyRateNight: null,
    defaultShift: null,
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    workDaysPerWeek: null,
    ...overrides,
  }
}

export function makeEmployeeConstraint(
  constraintType: ConstraintType,
  config: Record<string, unknown> = {},
  overrides: Partial<EmployeeConstraint> = {}
): EmployeeConstraint {
  return {
    id: `emp-constraint-${constraintType}`,
    userId: 'emp-1',
    constraintType,
    config,
    validFrom: null,
    validTo: null,
    priority: 5,
    isHardConstraint: true,
    venueId: VENUE_ID,
    ...overrides,
  }
}

export function makeRelConstraint(
  constraintType: RelConstraintType,
  userIds: string[],
  overrides: Partial<RelationshipConstraint> = {}
): RelationshipConstraint {
  return {
    id: `rel-constraint-${constraintType}`,
    constraintType,
    config: {},
    validFrom: null,
    validTo: null,
    priority: 5,
    isHardConstraint: true,
    venueId: VENUE_ID,
    userIds,
    ...overrides,
  }
}

export function makeAssignment(
  userId: string,
  date: Date,
  shift: ShiftDefinition,
  overrides: Partial<ShiftAssignment> = {}
): ShiftAssignment {
  const totalMinutes =
    shift.endTime.getHours() * 60 +
    shift.endTime.getMinutes() -
    (shift.startTime.getHours() * 60 + shift.startTime.getMinutes())
  const hours = (totalMinutes - shift.breakMinutes) / 60

  return {
    scheduleId: 'schedule-1',
    userId,
    shiftDefinitionId: shift.id,
    date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
    venueId: shift.venueId,
    hoursScheduled: hours,
    costEstimated: 0,
    ...overrides,
  }
}
