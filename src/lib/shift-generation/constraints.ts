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
} from './types'

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
  existingAssignments: ShiftAssignment[]
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

  // Check if already assigned on this date
  const sameDay = existingAssignments.find(
    a => a.userId === employee.id &&
         new Date(a.date).toDateString() === date.toDateString()
  )
  if (sameDay) {
    return { canWork: false, reason: 'Già assegnato in questo giorno' }
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

    const prefShiftType = (pref.config.shiftType as string || '').toLowerCase()
    const shiftName = shift.name.toLowerCase()
    const shiftCode = shift.code.toLowerCase()

    const matchesShift =
      shiftName.includes(prefShiftType) ||
      prefShiftType.includes(shiftName) ||
      shiftCode.includes(prefShiftType) ||
      prefShiftType.includes(shiftCode)

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
      const prevEnd = new Date(prevAssignment.endTime)
      const currentStart = new Date(date)
      currentStart.setHours(shift.startTime.getHours(), shift.startTime.getMinutes())

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

    // Calculate hours in current week
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const weeklyHours = existingAssignments
      .filter(a => {
        const aDate = new Date(a.date)
        return a.userId === employee.id &&
               aDate >= weekStart &&
               aDate <= weekEnd
      })
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
 * Check relationship constraints between employees
 */
export function checkRelationshipConstraints(
  assignment1: { userId: string; date: Date; shiftDefinitionId: string },
  assignment2: { userId: string; date: Date; shiftDefinitionId: string },
  constraints: RelationshipConstraint[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []

  for (const constraint of constraints) {
    // Check if both users are involved in this constraint
    const user1Involved = constraint.userIds.includes(assignment1.userId)
    const user2Involved = constraint.userIds.includes(assignment2.userId)

    if (!user1Involved || !user2Involved) continue
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

      case 'SAME_DAY_OFF':
        // Check if one works and one doesn't (if we have full schedule)
        // This is complex and requires the full schedule context
        break

      case 'MIN_OVERLAP':
        // Check if minimum overlap is respected for handover
        // This requires checking actual shift times overlap
        break

      case 'MAX_TOGETHER':
        // Check maximum hours together per week
        // Requires weekly context
        break
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
    const prefShiftType = (pref.config.shiftType as string || '').toLowerCase()
    const shiftName = shift.name.toLowerCase()
    const shiftCode = shift.code.toLowerCase()

    // Check if this preference matches the current shift
    const matchesShift =
      shiftName.includes(prefShiftType) ||
      prefShiftType.includes(shiftName) ||
      shiftCode.includes(prefShiftType) ||
      prefShiftType.includes(shiftCode)

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
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const currentHours = existingAssignments
      .filter(a => {
        const aDate = new Date(a.date)
        return a.userId === employee.id &&
               aDate >= weekStart &&
               aDate <= weekEnd
      })
      .reduce((sum, a) => sum + a.hoursScheduled, 0)

    const contractHours = employee.contractHoursWeek || 40
    const utilizationPercent = (currentHours / contractHours) * 100

    // Higher score for lower utilization
    score += Math.max(0, 30 - utilizationPercent * 0.3)
  }

  // Minimize cost (prefer cheaper employees)
  if (params.minimizeCost) {
    const hourlyRate = employee.hourlyRateBase || 10
    // Normalize: assume max rate is 30€/h
    score -= Math.min(30, hourlyRate)
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
