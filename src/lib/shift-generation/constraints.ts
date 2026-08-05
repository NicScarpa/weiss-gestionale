/**
 * Constraint validation for shift generation
 */

import {
  Employee,
  EmployeeConstraint,
  RelationshipConstraint,
  ShiftDefinition,
  ShiftAssignment,
  ConstraintViolation,
  EmployeeAvailability,
  LeaveRequest,
  ShiftBand,
} from './types'

/**
 * Valori di default dei vincoli relazionali.
 *
 * Il modello Prisma `RelationshipConstraint` non ha campi numerici dedicati:
 * l'unico contenitore è `config` (Json libero). L'editor in UI oggi salva
 * `config: {}`, quindi finché non espone gli input questi default sono ciò che
 * il solver applica davvero.
 */
export const REL_CONSTRAINT_DEFAULTS = {
  /** Minuti di sovrapposizione richiesti fra due turni diversi dello stesso giorno */
  MIN_OVERLAP_MINUTES: 30,
  /** Turni in comune consentiti per settimana quando config non specifica nulla */
  MAX_SHIFTS_TOGETHER: 3,
} as const

/**
 * Confini delle fasce orarie, in ore. Un turno che inizia prima delle 12 è di
 * mattina, fra le 12 e le 17 di pomeriggio, dalle 17 in poi di sera.
 */
const AFTERNOON_START_HOUR = 12
const EVENING_START_HOUR = 17

const MINUTES_PER_DAY = 24 * 60

/**
 * Check if a constraint is active on a given date
 */
export function isConstraintActive(
  constraint: EmployeeConstraint | RelationshipConstraint,
  date: Date
): boolean {
  if (constraint.validFrom && date < constraint.validFrom) {
    return false
  }
  if (constraint.validTo && date > constraint.validTo) {
    return false
  }
  return true
}

/**
 * Get day of week (0 = Sunday, 6 = Saturday)
 */
function getDayOfWeek(date: Date): number {
  return date.getDay()
}

/**
 * Parse time string to hours and minutes
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return { hours, minutes }
}

/**
 * Formatta una data come YYYY-MM-DD in fuso locale (mai UTC: `toISOString()`
 * sposterebbe il giorno per le sedi a est/ovest di Greenwich).
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Lunedì della settimana che contiene `date` (settimana ISO, come il calendario
 * turni mostrato in UI), normalizzato a mezzanotte locale.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 = domenica
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Chiave stabile della settimana, usabile per raggruppare le assegnazioni.
 */
export function getWeekKey(date: Date): string {
  return formatDateKey(getWeekStart(date))
}

/**
 * Minuti dalla mezzanotte dell'orario di inizio turno.
 *
 * `ShiftDefinition.startTime` è un `@db.Time`: Prisma lo restituisce come Date
 * con data fittizia. Si legge l'ora locale, coerentemente con il resto del file
 * (`toTimeString()`, `getHours()` nei controlli di disponibilità e riposo).
 */
function minutesFromMidnight(time: Date): number {
  return time.getHours() * 60 + time.getMinutes()
}

/**
 * Intervallo del turno in minuti dalla mezzanotte del giorno di inizio.
 * Per i turni a cavallo della mezzanotte la fine sfora oltre i 1440 minuti.
 */
export function getShiftMinutesRange(shift: ShiftDefinition): { start: number; end: number } {
  const start = minutesFromMidnight(shift.startTime)
  let end = minutesFromMidnight(shift.endTime)
  if (end <= start) {
    end += MINUTES_PER_DAY
  }
  return { start, end }
}

/**
 * Fascia oraria del turno, derivata dall'orario di inizio.
 *
 * `ShiftDefinition` non ha un campo strutturato per la fascia, e il nome non è
 * affidabile: un turno "Brunch" o "Aperitivo" non contiene né "mattina" né
 * "sera". L'orario di inizio è l'unico dato certo.
 */
export function getShiftBand(shift: ShiftDefinition): ShiftBand {
  const startHour = Math.floor(getShiftMinutesRange(shift).start / 60)

  if (startHour < AFTERNOON_START_HOUR) return 'MORNING'
  if (startHour < EVENING_START_HOUR) return 'AFTERNOON'
  return 'EVENING'
}

/**
 * Il turno è compatibile con la preferenza del dipendente (`User.defaultShift`)?
 *
 * `defaultShift` conosce solo MORNING/EVENING: il pomeriggio viene accorpato
 * alla sera, come faceva il match testuale precedente (trattava "POMERIGGIO"
 * come turno serale).
 */
export function matchesPreferredBand(
  defaultShift: Employee['defaultShift'],
  band: ShiftBand
): boolean {
  if (!defaultShift) return true
  if (defaultShift === 'MORNING') return band === 'MORNING'
  return band === 'AFTERNOON' || band === 'EVENING'
}

/**
 * Mappa il valore libero di `PREFERRED_SHIFT.config.shiftType` su una fascia
 * oraria, quando è riconoscibile (italiano o inglese). Ritorna null se è
 * un'altra cosa: in quel caso resta valido il confronto su nome/codice turno.
 */
function parseShiftTypeAsBand(shiftType: string): ShiftBand | null {
  const normalized = shiftType.trim().toLowerCase()
  if (!normalized) return null

  if (['mattina', 'mattino', 'morning'].includes(normalized)) return 'MORNING'
  if (['pomeriggio', 'afternoon'].includes(normalized)) return 'AFTERNOON'
  if (['sera', 'serale', 'evening', 'night', 'notte'].includes(normalized)) return 'EVENING'

  return null
}

/**
 * Un vincolo PREFERRED_SHIFT si riferisce a questo turno?
 *
 * Se `shiftType` nomina una fascia oraria si confronta la fascia derivata
 * dall'orario; altrimenti si ricade sul confronto con nome e codice del turno,
 * che permette di puntare a un turno specifico ("Aperitivo").
 */
export function matchesShiftType(shift: ShiftDefinition, shiftType: string): boolean {
  const normalized = (shiftType || '').trim().toLowerCase()
  if (!normalized) return false

  const band = parseShiftTypeAsBand(normalized)
  if (band) {
    return getShiftBand(shift) === band
  }

  const shiftName = shift.name.toLowerCase()
  const shiftCode = shift.code.toLowerCase()

  return (
    shiftName.includes(normalized) ||
    normalized.includes(shiftName) ||
    shiftCode.includes(normalized) ||
    normalized.includes(shiftCode)
  )
}

/**
 * Istante reale di fine di un'assegnazione.
 *
 * `startTime`/`endTime` sono orari (Time Prisma con data fittizia): l'unico
 * giorno valido è `date`. Se la fine non supera l'inizio il turno scavalca la
 * mezzanotte e finisce il giorno dopo.
 */
export function getAssignmentEnd(assignment: {
  date: Date
  startTime: Date
  endTime: Date
}): Date {
  const day = new Date(assignment.date)
  const end = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    assignment.endTime.getHours(),
    assignment.endTime.getMinutes(),
    0,
    0
  )

  const startMinutes = minutesFromMidnight(assignment.startTime)
  const endMinutes = minutesFromMidnight(assignment.endTime)
  if (endMinutes <= startMinutes) {
    end.setDate(end.getDate() + 1)
  }

  return end
}

/**
 * Minuti di sovrapposizione fra due turni svolti lo stesso giorno.
 * Zero se non si toccano.
 */
export function calculateShiftOverlapMinutes(
  shiftA: ShiftDefinition,
  shiftB: ShiftDefinition
): number {
  const a = getShiftMinutesRange(shiftA)
  const b = getShiftMinutesRange(shiftB)

  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
}

/**
 * Check if employee is available on a specific date based on their constraints
 */
export function checkEmployeeAvailability(
  employee: Employee,
  date: Date,
  constraints: EmployeeConstraint[],
  existingAssignments: ShiftAssignment[]
): EmployeeAvailability {
  const result: EmployeeAvailability = {
    userId: employee.id,
    date,
    isAvailable: true,
  }

  const dayOfWeek = getDayOfWeek(date)

  for (const constraint of constraints) {
    if (!isConstraintActive(constraint, date)) continue

    const config = constraint.config as Record<string, unknown>

    switch (constraint.constraintType) {
      case 'BLOCKED_DAY':
        if (config.dayOfWeek === dayOfWeek) {
          if (constraint.isHardConstraint) {
            result.isAvailable = false
            result.reason = (config.reason as string) || 'Giorno bloccato'
            return result
          }
        }
        break

      case 'AVAILABILITY':
        if (config.dayOfWeek === dayOfWeek) {
          if (config.available === false) {
            if (constraint.isHardConstraint) {
              result.isAvailable = false
              result.reason = 'Non disponibile in questo giorno'
              return result
            }
          } else {
            // Set availability window
            if (config.startTime) {
              result.availableFrom = config.startTime as string
            }
            if (config.endTime) {
              result.availableTo = config.endTime as string
            }
          }
        }
        break

      case 'CONSECUTIVE_DAYS':
        // Check consecutive work days
        const maxDays = (config.maxDays as number) || 6
        let consecutiveDays = 0

        for (let i = 1; i <= maxDays; i++) {
          const checkDate = new Date(date)
          checkDate.setDate(checkDate.getDate() - i)
          const hasAssignment = existingAssignments.some(
            a => a.userId === employee.id &&
                 new Date(a.date).toDateString() === checkDate.toDateString()
          )
          if (hasAssignment) {
            consecutiveDays++
          } else {
            break
          }
        }

        if (consecutiveDays >= maxDays) {
          if (constraint.isHardConstraint) {
            result.isAvailable = false
            result.reason = `Max ${maxDays} giorni consecutivi raggiunto`
            return result
          }
        }
        break
    }
  }

  return result
}

/**
 * Check if an employee can work a specific shift
 */
export function canEmployeeWorkShift(
  employee: Employee,
  shift: ShiftDefinition,
  date: Date,
  constraints: EmployeeConstraint[],
  existingAssignments: ShiftAssignment[],
  leaveRequests: LeaveRequest[] = []
): { canWork: boolean; reason?: string; isPenalized?: boolean } {
  // Check basic availability
  const availability = checkEmployeeAvailability(
    employee,
    date,
    constraints,
    existingAssignments
  )

  if (!availability.isAvailable) {
    return { canWork: false, reason: availability.reason }
  }

  // Check if employee is on approved leave
  for (const leave of leaveRequests) {
    if (leave.userId === employee.id && leave.status === 'APPROVED') {
      const leaveStart = new Date(leave.startDate)
      const leaveEnd = new Date(leave.endDate)
      // Normalize dates to compare just the date part
      leaveStart.setHours(0, 0, 0, 0)
      leaveEnd.setHours(23, 59, 59, 999)
      const checkDate = new Date(date)
      checkDate.setHours(12, 0, 0, 0)

      if (checkDate >= leaveStart && checkDate <= leaveEnd) {
        return { canWork: false, reason: 'In ferie/permesso' }
      }
    }
  }

  // Check if already assigned on this date
  const sameDay = existingAssignments.find(
    a => a.userId === employee.id &&
         new Date(a.date).toDateString() === date.toDateString()
  )
  if (sameDay) {
    return { canWork: false, reason: 'Già assegnato in questo giorno' }
  }

  // Check defaultShift preference (MORNING/EVENING) sulla fascia derivata
  // dall'orario di inizio, non sul nome del turno
  if (employee.defaultShift && !matchesPreferredBand(employee.defaultShift, getShiftBand(shift))) {
    return {
      canWork: false,
      reason: employee.defaultShift === 'MORNING' ? 'Turno preferito: mattina' : 'Turno preferito: sera',
    }
  }

  // Check availableDays for extra staff (non-fixed)
  if (!employee.isFixedStaff && employee.availableDays && employee.availableDays.length > 0) {
    const jsDay = date.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
    // Convert JS day to our format: 0=Monday, 1=Tuesday, ..., 6=Sunday
    const ourDayIndex = jsDay === 0 ? 6 : jsDay - 1

    if (!employee.availableDays.includes(ourDayIndex)) {
      return { canWork: false, reason: 'Non disponibile questo giorno' }
    }
  }

  // Check skill requirements
  if (shift.requiredSkills.length > 0) {
    const hasAllSkills = shift.requiredSkills.every(
      skill => employee.skills.includes(skill)
    )
    if (!hasAllSkills) {
      return { canWork: false, reason: 'Competenze mancanti' }
    }
  }

  // Check venue match
  if (employee.venueId && shift.venueId !== employee.venueId) {
    return { canWork: false, reason: 'Sede diversa' }
  }

  // Check shift preferences (hard constraints)
  const shiftPreferences = constraints.filter(
    c => c.constraintType === 'PREFERRED_SHIFT' && isConstraintActive(c, date)
  )

  for (const pref of shiftPreferences) {
    if (!pref.isHardConstraint) continue

    const prefShiftType = (pref.config.shiftType as string) || ''
    const matchesShift = matchesShiftType(shift, prefShiftType)

    if (pref.config.preference === 'PREFER' && !matchesShift) {
      // Hard preference for a different shift - cannot assign this one
      return { canWork: false, reason: `Solo turno ${pref.config.shiftType}` }
    }

    if (pref.config.preference === 'AVOID' && matchesShift) {
      // Hard avoid for this shift - cannot assign
      return { canWork: false, reason: `Non può lavorare turno ${pref.config.shiftType}` }
    }
  }

  // Check time window
  if (availability.availableFrom || availability.availableTo) {
    const shiftStart = parseTime(
      shift.startTime.toTimeString().substring(0, 5)
    )
    const shiftEnd = parseTime(
      shift.endTime.toTimeString().substring(0, 5)
    )

    if (availability.availableFrom) {
      const availFrom = parseTime(availability.availableFrom)
      if (
        shiftStart.hours < availFrom.hours ||
        (shiftStart.hours === availFrom.hours && shiftStart.minutes < availFrom.minutes)
      ) {
        return { canWork: false, reason: 'Turno inizia prima della disponibilità' }
      }
    }

    if (availability.availableTo) {
      const availTo = parseTime(availability.availableTo)
      if (
        shiftEnd.hours > availTo.hours ||
        (shiftEnd.hours === availTo.hours && shiftEnd.minutes > availTo.minutes)
      ) {
        return { canWork: false, reason: 'Turno finisce dopo la disponibilità' }
      }
    }
  }

  // Check minimum rest between shifts
  const minRestConstraint = constraints.find(
    c => c.constraintType === 'MIN_REST' && isConstraintActive(c, date)
  )
  if (minRestConstraint) {
    const minRestHours = (minRestConstraint.config.minRestHours as number) || 11

    // Check previous day's shift
    const prevDate = new Date(date)
    prevDate.setDate(prevDate.getDate() - 1)
    const prevAssignment = existingAssignments.find(
      a => a.userId === employee.id &&
           new Date(a.date).toDateString() === prevDate.toDateString()
    )

    if (prevAssignment) {
      // `endTime` è una Time Prisma (data fittizia 1970): va ricomposta con il
      // giorno dell'assegnazione, altrimenti la differenza sono decenni e il
      // riposo minimo non scatta mai
      const prevEnd = getAssignmentEnd(prevAssignment)
      const currentStart = new Date(date)
      currentStart.setHours(shift.startTime.getHours(), shift.startTime.getMinutes(), 0, 0)

      const restHours = (currentStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60)
      if (restHours < minRestHours) {
        if (minRestConstraint.isHardConstraint) {
          return { canWork: false, reason: `Riposo insufficiente (${Math.round(restHours)}h vs ${minRestHours}h richieste)` }
        } else {
          return { canWork: true, isPenalized: true }
        }
      }
    }
  }

  // Check weekly hours constraint
  const maxHoursConstraint = constraints.find(
    c => c.constraintType === 'MAX_HOURS' && isConstraintActive(c, date)
  )
  if (maxHoursConstraint) {
    const maxHours = (maxHoursConstraint.config.maxHours as number) || 40

    // Ore già assegnate nella stessa settimana (lunedì-domenica, come il resto
    // del solver: partire dalla domenica spezzava il weekend in due settimane e
    // lasciava sforare il tetto)
    const weekKey = getWeekKey(date)
    const weeklyHours = existingAssignments
      .filter(a => a.userId === employee.id && getWeekKey(new Date(a.date)) === weekKey)
      .reduce((sum, a) => sum + a.hoursScheduled, 0)

    const shiftHours = calculateShiftHours(shift)
    if (weeklyHours + shiftHours > maxHours) {
      if (maxHoursConstraint.isHardConstraint) {
        return { canWork: false, reason: `Supererebbe ore max settimanali (${weeklyHours + shiftHours}h vs ${maxHours}h)` }
      } else {
        return { canWork: true, isPenalized: true }
      }
    }
  }

  return { canWork: true }
}

/**
 * Calculate hours for a shift
 */
export function calculateShiftHours(shift: ShiftDefinition): number {
  const startMs = shift.startTime.getTime()
  let endMs = shift.endTime.getTime()

  // Handle overnight shifts
  if (endMs < startMs) {
    endMs += 24 * 60 * 60 * 1000
  }

  const totalMinutes = (endMs - startMs) / (1000 * 60)
  const workMinutes = totalMinutes - shift.breakMinutes

  return Math.round((workMinutes / 60) * 100) / 100
}

/**
 * Minuti di sovrapposizione richiesti da un vincolo MIN_OVERLAP.
 *
 * Cerca in `config` le chiavi note (`minOverlapMinutes`, `minutes`, `value`)
 * perché il modello Prisma non ha un campo dedicato; se nessuna è presente o
 * valorizzata correttamente usa il default documentato.
 */
export function getMinOverlapMinutes(constraint: RelationshipConstraint): number {
  const config = constraint.config || {}
  const candidates = [config.minOverlapMinutes, config.minutes, config.value]

  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }

  return REL_CONSTRAINT_DEFAULTS.MIN_OVERLAP_MINUTES
}

/**
 * Tetto settimanale di un vincolo MAX_TOGETHER.
 *
 * Si può esprimere in ore (`maxHoursTogether`) o in turni (`maxShiftsTogether`,
 * `maxTogether`, `value`). Senza configurazione vale il default in turni.
 */
export function getMaxTogetherLimit(constraint: RelationshipConstraint): {
  unit: 'hours' | 'shifts'
  limit: number
} {
  const config = constraint.config || {}

  const hours = Number(config.maxHoursTogether)
  if (Number.isFinite(hours) && hours >= 0) {
    return { unit: 'hours', limit: hours }
  }

  const shiftCandidates = [config.maxShiftsTogether, config.maxTogether, config.value]
  for (const candidate of shiftCandidates) {
    const parsed = Number(candidate)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return { unit: 'shifts', limit: parsed }
    }
  }

  return { unit: 'shifts', limit: REL_CONSTRAINT_DEFAULTS.MAX_SHIFTS_TOGETHER }
}

/**
 * Check relationship constraints between employees
 *
 * Valuta i vincoli verificabili guardando due sole assegnazioni:
 * NEVER_TOGETHER, ALWAYS_TOGETHER e MIN_OVERLAP. SAME_DAY_OFF e MAX_TOGETHER
 * richiedono l'intera settimana e stanno in `checkWeeklyRelationshipConstraints`.
 *
 * `shiftDefinitions` serve solo a MIN_OVERLAP (per leggere gli orari): se non
 * viene passata, quel vincolo non viene valutato invece di produrre un falso
 * positivo.
 */
export function checkRelationshipConstraints(
  assignment1: { userId: string; date: Date; shiftDefinitionId: string },
  assignment2: { userId: string; date: Date; shiftDefinitionId: string },
  constraints: RelationshipConstraint[],
  shiftDefinitions?: ShiftDefinition[] | Map<string, ShiftDefinition>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []

  const shiftsById =
    shiftDefinitions instanceof Map
      ? shiftDefinitions
      : new Map((shiftDefinitions || []).map(s => [s.id, s]))

  for (const constraint of constraints) {
    // Check if both users are involved in this constraint
    const user1Involved = constraint.userIds.includes(assignment1.userId)
    const user2Involved = constraint.userIds.includes(assignment2.userId)

    if (!user1Involved || !user2Involved) continue
    if (assignment1.userId === assignment2.userId) continue
    if (!isConstraintActive(constraint, assignment1.date)) continue

    const sameDate = assignment1.date.toDateString() === assignment2.date.toDateString()
    const sameShift = assignment1.shiftDefinitionId === assignment2.shiftDefinitionId

    switch (constraint.constraintType) {
      case 'NEVER_TOGETHER':
        if (sameDate && sameShift) {
          violations.push({
            constraintId: constraint.id,
            constraintType: constraint.constraintType,
            message: 'Dipendenti non dovrebbero lavorare insieme',
            employeeIds: [assignment1.userId, assignment2.userId],
            date: assignment1.date,
            severity: constraint.isHardConstraint ? 'hard' : 'soft',
          })
        }
        break

      case 'ALWAYS_TOGETHER':
        if (sameDate && !sameShift) {
          violations.push({
            constraintId: constraint.id,
            constraintType: constraint.constraintType,
            message: 'Dipendenti dovrebbero lavorare insieme',
            employeeIds: [assignment1.userId, assignment2.userId],
            date: assignment1.date,
            severity: constraint.isHardConstraint ? 'hard' : 'soft',
          })
        }
        break

      case 'MIN_OVERLAP': {
        // Passaggio di consegne: lo stesso giorno in turni diversi le fasce
        // devono sovrapporsi almeno N minuti. Stesso turno = sovrapposizione
        // totale, nessun controllo necessario.
        if (!sameDate || sameShift) break

        const shift1 = shiftsById.get(assignment1.shiftDefinitionId)
        const shift2 = shiftsById.get(assignment2.shiftDefinitionId)
        if (!shift1 || !shift2) break

        const requiredMinutes = getMinOverlapMinutes(constraint)
        const overlapMinutes = calculateShiftOverlapMinutes(shift1, shift2)

        if (overlapMinutes < requiredMinutes) {
          violations.push({
            constraintId: constraint.id,
            constraintType: constraint.constraintType,
            message: `Sovrapposizione insufficiente per il passaggio di consegne (${overlapMinutes} min vs ${requiredMinutes} min richiesti)`,
            employeeIds: [assignment1.userId, assignment2.userId],
            date: assignment1.date,
            severity: constraint.isHardConstraint ? 'hard' : 'soft',
          })
        }
        break
      }

      case 'SAME_DAY_OFF':
      case 'MAX_TOGETHER':
        // Vincoli settimanali: vedi checkWeeklyRelationshipConstraints
        break
    }
  }

  return violations
}

/**
 * Vincoli relazionali che si possono giudicare solo sull'intera settimana.
 *
 * - SAME_DAY_OFF: i dipendenti coinvolti devono condividere almeno un giorno di
 *   riposo per settimana. Si valuta solo sui giorni realmente pianificati
 *   (`daysInPeriod`, o in mancanza i giorni con assegnazioni): una settimana
 *   troncata dal periodo non deve produrre violazioni fantasma.
 * - MAX_TOGETHER: tetto ai turni (o alle ore) svolti fianco a fianco in una
 *   settimana. Contano solo i turni identici nello stesso giorno, cioè il tempo
 *   effettivamente passato insieme.
 */
export function checkWeeklyRelationshipConstraints(
  assignments: ShiftAssignment[],
  constraints: RelationshipConstraint[],
  options: { daysInPeriod?: Date[] } = {}
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []

  const days = options.daysInPeriod?.length
    ? options.daysInPeriod
    : [...new Set(assignments.map(a => formatDateKey(new Date(a.date))))]
        .sort()
        .map(key => new Date(`${key}T00:00:00`))

  // Giorni del periodo raggruppati per settimana
  const daysByWeek = new Map<string, Date[]>()
  for (const day of days) {
    const weekKey = getWeekKey(day)
    if (!daysByWeek.has(weekKey)) daysByWeek.set(weekKey, [])
    daysByWeek.get(weekKey)!.push(day)
  }

  // Indice: utente -> giorno -> turni svolti
  const shiftsByUserAndDay = new Map<string, Map<string, string[]>>()
  const hoursByUserDayShift = new Map<string, number>()
  for (const assignment of assignments) {
    const dayKey = formatDateKey(new Date(assignment.date))
    if (!shiftsByUserAndDay.has(assignment.userId)) {
      shiftsByUserAndDay.set(assignment.userId, new Map())
    }
    const byDay = shiftsByUserAndDay.get(assignment.userId)!
    if (!byDay.has(dayKey)) byDay.set(dayKey, [])
    byDay.get(dayKey)!.push(assignment.shiftDefinitionId)

    hoursByUserDayShift.set(
      `${assignment.userId}_${dayKey}_${assignment.shiftDefinitionId}`,
      assignment.hoursScheduled
    )
  }

  const worksOn = (userId: string, dayKey: string): boolean =>
    (shiftsByUserAndDay.get(userId)?.get(dayKey)?.length ?? 0) > 0

  for (const constraint of constraints) {
    if (constraint.userIds.length < 2) continue

    for (const [, weekDays] of daysByWeek) {
      const activeDays = weekDays.filter(day => isConstraintActive(constraint, day))
      if (activeDays.length === 0) continue

      const weekStart = activeDays[0]

      if (constraint.constraintType === 'SAME_DAY_OFF') {
        // Solo su una settimana interamente pianificata si può dire che il
        // riposo comune manca: se restano giorni fuori dal periodo (o fuori
        // dalla validità del vincolo) il riposo può cadere lì
        if (activeDays.length < 7) continue

        const hasCommonDayOff = activeDays.some(day => {
          const dayKey = formatDateKey(day)
          return constraint.userIds.every(userId => !worksOn(userId, dayKey))
        })

        // Se nessuno dei coinvolti ha assegnazioni nella settimana il vincolo è
        // banalmente soddisfatto e non va segnalato
        const someoneWorks = activeDays.some(day =>
          constraint.userIds.some(userId => worksOn(userId, formatDateKey(day)))
        )

        if (!hasCommonDayOff && someoneWorks) {
          violations.push({
            constraintId: constraint.id,
            constraintType: constraint.constraintType,
            message: 'Nessun giorno di riposo in comune nella settimana',
            employeeIds: [...constraint.userIds],
            date: weekStart,
            severity: constraint.isHardConstraint ? 'hard' : 'soft',
          })
        }
      }

      if (constraint.constraintType === 'MAX_TOGETHER') {
        const { unit, limit } = getMaxTogetherLimit(constraint)
        let togetherShifts = 0
        let togetherHours = 0

        for (const day of activeDays) {
          const dayKey = formatDateKey(day)
          const [firstUser, ...otherUsers] = constraint.userIds
          const firstUserShifts = shiftsByUserAndDay.get(firstUser)?.get(dayKey) || []

          for (const shiftId of firstUserShifts) {
            const allTogether = otherUsers.every(userId =>
              (shiftsByUserAndDay.get(userId)?.get(dayKey) || []).includes(shiftId)
            )
            if (!allTogether) continue

            togetherShifts++
            togetherHours += hoursByUserDayShift.get(`${firstUser}_${dayKey}_${shiftId}`) ?? 0
          }
        }

        const actual = unit === 'hours' ? togetherHours : togetherShifts
        if (actual > limit) {
          violations.push({
            constraintId: constraint.id,
            constraintType: constraint.constraintType,
            message:
              unit === 'hours'
                ? `Troppe ore insieme nella settimana (${actual}h vs max ${limit}h)`
                : `Troppi turni insieme nella settimana (${actual} vs max ${limit})`,
            employeeIds: [...constraint.userIds],
            date: weekStart,
            severity: constraint.isHardConstraint ? 'hard' : 'soft',
          })
        }
      }
    }
  }

  return violations
}

/**
 * Calculate employee score for shift assignment (higher is better)
 */
export function calculateEmployeeScore(
  employee: Employee,
  shift: ShiftDefinition,
  date: Date,
  constraints: EmployeeConstraint[],
  existingAssignments: ShiftAssignment[],
  params: {
    preferFixedStaff: boolean
    balanceHours: boolean
    minimizeCost: boolean
  }
): number {
  let score = 100 // Base score

  // Prefer fixed staff
  if (params.preferFixedStaff && employee.isFixedStaff) {
    score += 20
  }

  // Check for shift preferences (PREFERRED_SHIFT constraints)
  const shiftPreferences = constraints.filter(
    c => c.constraintType === 'PREFERRED_SHIFT' && isConstraintActive(c, date)
  )

  for (const pref of shiftPreferences) {
    const prefShiftType = (pref.config.shiftType as string) || ''

    // Check if this preference matches the current shift
    const matchesShift = matchesShiftType(shift, prefShiftType)

    if (pref.config.preference === 'PREFER') {
      if (matchesShift) {
        // Employee prefers this shift type - big bonus
        score += 30
      } else {
        // Employee prefers a different shift - penalty
        score -= 20
      }
    } else if (pref.config.preference === 'AVOID') {
      if (matchesShift) {
        // Employee wants to avoid this shift - big penalty
        score -= 40
      }
    }
  }

  // Balance hours (give higher score to employees with fewer hours)
  if (params.balanceHours) {
    const weekKey = getWeekKey(date)
    const currentHours = existingAssignments
      .filter(a => a.userId === employee.id && getWeekKey(new Date(a.date)) === weekKey)
      .reduce((sum, a) => sum + a.hoursScheduled, 0)

    const contractHours = employee.contractHoursWeek || 40
    const utilizationPercent = (currentHours / contractHours) * 100

    // Higher score for lower utilization
    score += Math.max(0, 30 - utilizationPercent * 0.3)
  }

  // Minimize cost (prefer cheaper employees)
  // Senza tariffa nota non si applica penalità: inventare un valore
  // falserebbe la classifica. Il dato mancante è segnalato a parte come
  // warning MISSING_RATE.
  if (params.minimizeCost && employee.hourlyRateBase) {
    // Normalize: assume max rate is 30€/h
    score -= Math.min(30, employee.hourlyRateBase)
  }

  // Check skills match (bonus for exact match, no bonus for overqualified)
  if (shift.requiredSkills.length > 0) {
    const matchingSkills = shift.requiredSkills.filter(
      skill => employee.skills.includes(skill)
    ).length
    const matchPercent = matchingSkills / shift.requiredSkills.length
    score += matchPercent * 10
  }

  return score
}
