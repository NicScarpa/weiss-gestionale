/**
 * Greedy Solver for Shift Generation
 *
 * Algorithm:
 * 1. Load constraints and availability
 * 2. For each day in the period:
 *    a. Sort shifts by priority (evening > afternoon > morning)
 *    b. For each shift:
 *       - Filter available employees (hard constraints)
 *       - Sort by: remaining hours, cost, preferences
 *       - Assign until min_staff reached
 * 3. Validate result
 * 4. Generate warnings for soft constraints violated
 */

import {
  Employee,
  ShiftDefinition,
  EmployeeConstraint,
  RelationshipConstraint,
  ShiftAssignment,
  GenerationParams,
  GenerationResult,
  GenerationWarning,
  GenerationStats,
  EmployeeStats,
  LeaveRequest,
} from './types'
import {
  canEmployeeWorkShift,
  calculateShiftHours,
  checkRelationshipConstraints,
  calculateEmployeeScore,
} from './constraints'

interface SolverContext {
  employees: Employee[]
  shiftDefinitions: ShiftDefinition[]
  employeeConstraints: Map<string, EmployeeConstraint[]>
  relationshipConstraints: RelationshipConstraint[]
  leaveRequests: LeaveRequest[]
  params: GenerationParams
  scheduleId: string
}

/**
 * Format date to YYYY-MM-DD using local timezone (not UTC)
 * This ensures consistency with the frontend's date formatting
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get the Monday of the week for a given date
 * Used to track weekly work days for fixed staff
 */
function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  // Calculate Monday (0=SUN, 1=MON, ..., 6=SAT)
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

/**
 * Count unique days worked by an employee in a specific week
 */
function countDaysWorkedInWeek(
  employeeId: string,
  date: Date,
  existingAssignments: ShiftAssignment[],
  currentAssignments: ShiftAssignment[]
): number {
  const weekStart = getWeekStart(date)
  const uniqueDays = new Set<string>()

  // Check existing assignments
  for (const assignment of existingAssignments) {
    if (assignment.userId !== employeeId) continue
    const assignmentWeek = getWeekStart(assignment.date)
    if (assignmentWeek === weekStart) {
      uniqueDays.add(formatDateKey(assignment.date))
    }
  }

  // Check current iteration assignments
  for (const assignment of currentAssignments) {
    if (assignment.userId !== employeeId) continue
    const assignmentWeek = getWeekStart(assignment.date)
    if (assignmentWeek === weekStart) {
      uniqueDays.add(formatDateKey(assignment.date))
    }
  }

  return uniqueDays.size
}

/**
 * Generate shift assignments using greedy algorithm
 */
export function generateShiftsGreedy(context: SolverContext): GenerationResult {
  const assignments: ShiftAssignment[] = []
  const warnings: GenerationWarning[] = []

  const { employees, shiftDefinitions, employeeConstraints, relationshipConstraints, leaveRequests, params, scheduleId } = context

  // Generate dates in range
  const dates: Date[] = []
  const currentDate = new Date(params.startDate)
  while (currentDate <= params.endDate) {
    dates.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Sort shift definitions by position (priority)
  const sortedShifts = [...shiftDefinitions].sort((a, b) => b.position - a.position)

  // Process each day
  for (const date of dates) {
    // Process each shift definition
    for (const shift of sortedShifts) {
      if (shift.venueId !== params.venueId) continue

      const shiftAssignments = assignEmployeesToShift(
        date,
        shift,
        employees,
        employeeConstraints,
        relationshipConstraints,
        leaveRequests,
        assignments,
        params,
        scheduleId
      )

      assignments.push(...shiftAssignments.assignments)
      warnings.push(...shiftAssignments.warnings)
    }
  }

  // Validate relationship constraints across all assignments
  const relWarnings = validateRelationshipConstraints(assignments, relationshipConstraints)
  warnings.push(...relWarnings)

  // Calculate stats
  const stats = calculateStats(assignments, employees, params)

  return {
    success: warnings.filter(w => w.severity === 'high').length === 0,
    assignments,
    warnings,
    stats,
  }
}

/**
 * Assign employees to a single shift on a single day
 */
function assignEmployeesToShift(
  date: Date,
  shift: ShiftDefinition,
  employees: Employee[],
  employeeConstraints: Map<string, EmployeeConstraint[]>,
  relationshipConstraints: RelationshipConstraint[],
  leaveRequests: LeaveRequest[],
  existingAssignments: ShiftAssignment[],
  params: GenerationParams,
  scheduleId: string
): { assignments: ShiftAssignment[]; warnings: GenerationWarning[] } {
  const assignments: ShiftAssignment[] = []
  const warnings: GenerationWarning[] = []

  // Check for staffing override - use local timezone format to match frontend
  const dateKey = formatDateKey(date)
  const reqKey = `${dateKey}_${shift.id}`
  const overrideStaff = params.staffingRequirements?.[reqKey]

  // targetStaff: numero ESATTO di persone da assegnare
  // Se l'utente imposta un override, usa quello come target esatto
  // Altrimenti usa minStaff del turno come default
  const targetStaff = overrideStaff !== undefined ? overrideStaff : shift.minStaff

  // If targetStaff is 0, skip this shift entirely (no one should be assigned)
  if (targetStaff === 0) {
    return { assignments: [], warnings: [] }
  }

  // Filter and score available employees
  const candidatesWithScores: { employee: Employee; score: number; isPenalized: boolean }[] = []

  for (const employee of employees) {
    const todayKey = formatDateKey(date)
    const hasShiftToday = [...existingAssignments, ...assignments].some(
      a => a.userId === employee.id && formatDateKey(a.date) === todayKey
    )

    // Calculate days worked this week for constraint checks
    const daysWorkedThisWeek = employee.workDaysPerWeek
      ? countDaysWorkedInWeek(employee.id, date, existingAssignments, assignments)
      : 0

    // =============================================================
    // LOGICA WORKDAYS PER WEEK:
    // - STAFF FISSO: workDaysPerWeek è un MINIMO obbligatorio
    //   -> Ha priorità finché non raggiunge il minimo
    //   -> Una volta raggiunto il minimo, NON lavora più (si chiama l'extra)
    // - STAFF EXTRA: workDaysPerWeek è la disponibilità MASSIMA
    //   -> Non può superare il massimo
    //   -> Viene chiamato solo per coprire buchi
    // =============================================================

    if (employee.workDaysPerWeek && !hasShiftToday) {
      if (employee.isFixedStaff) {
        // STAFF FISSO: se ha già raggiunto il minimo, ESCLUDILO
        // Lo staff extra coprirà eventuali buchi rimanenti
        if (daysWorkedThisWeek >= employee.workDaysPerWeek) {
          continue
        }
      } else {
        // STAFF EXTRA: se ha già raggiunto il massimo disponibilità, ESCLUDILO
        if (daysWorkedThisWeek >= employee.workDaysPerWeek) {
          continue
        }
      }
    }

    const constraints = employeeConstraints.get(employee.id) || []
    const canWork = canEmployeeWorkShift(
      employee,
      shift,
      date,
      constraints,
      [...existingAssignments, ...assignments],
      leaveRequests
    )

    if (canWork.canWork) {
      let score = calculateEmployeeScore(
        employee,
        shift,
        date,
        constraints,
        [...existingAssignments, ...assignments],
        {
          preferFixedStaff: params.preferFixedStaff,
          balanceHours: params.balanceHours,
          minimizeCost: params.minimizeCost,
        }
      )

      // =============================================================
      // SISTEMA DI PRIORITÀ:
      // 1. Staff fisso sotto il minimo: score += 1000+ (DEVE lavorare)
      // 2. Staff extra: score normale ~100-200 (chiamato per coprire buchi)
      // Staff fisso sopra il minimo: già escluso sopra
      // =============================================================

      if (employee.isFixedStaff && employee.workDaysPerWeek) {
        // Staff fisso sotto il minimo: priorità MASSIMA
        if (!hasShiftToday && daysWorkedThisWeek < employee.workDaysPerWeek) {
          const daysRemaining = employee.workDaysPerWeek - daysWorkedThisWeek
          score += 1000 + (daysRemaining * 100)
        }
      }
      // Staff extra: mantiene il punteggio base (priorità inferiore)

      candidatesWithScores.push({
        employee,
        score: canWork.isPenalized ? score - 50 : score,
        isPenalized: canWork.isPenalized || false,
      })
    }
  }

  // Sort by score descending
  candidatesWithScores.sort((a, b) => b.score - a.score)

  // Assign employees until targetStaff reached
  // targetStaff is the EXACT number requested (from override or shift.minStaff)
  let assigned = 0
  for (const candidate of candidatesWithScores) {
    if (assigned >= targetStaff) break

    // Check relationship constraints with already assigned employees
    let hasHardViolation = false
    for (const existingAssignment of assignments) {
      const violations = checkRelationshipConstraints(
        { userId: candidate.employee.id, date, shiftDefinitionId: shift.id },
        { userId: existingAssignment.userId, date: existingAssignment.date, shiftDefinitionId: existingAssignment.shiftDefinitionId },
        relationshipConstraints
      )

      const hardViolations = violations.filter(v => v.severity === 'hard')
      if (hardViolations.length > 0) {
        hasHardViolation = true
        break
      }
    }

    if (hasHardViolation) continue

    // Create assignment
    const shiftHours = calculateShiftHours(shift)
    const hourlyRate = candidate.employee.hourlyRateBase || 10
    const costEstimated = shiftHours * hourlyRate * Number(shift.rateMultiplier)

    const assignment: ShiftAssignment = {
      scheduleId,
      userId: candidate.employee.id,
      shiftDefinitionId: shift.id,
      date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      venueId: shift.venueId,
      hoursScheduled: shiftHours,
      costEstimated,
    }

    assignments.push(assignment)
    assigned++

    if (candidate.isPenalized) {
      warnings.push({
        type: 'SOFT_CONSTRAINT_VIOLATED',
        message: `Soft constraint violato per ${candidate.employee.firstName} ${candidate.employee.lastName}`,
        date,
        shiftDefinitionId: shift.id,
        employeeId: candidate.employee.id,
        severity: 'low',
      })
    }
  }

  // Check if we have enough staff
  if (assigned < targetStaff) {
    warnings.push({
      type: 'UNDERSTAFFED',
      message: `Turno ${shift.name} sottorganico: ${assigned}/${targetStaff} dipendenti`,
      date,
      shiftDefinitionId: shift.id,
      severity: 'high',
    })
  }

  return { assignments, warnings }
}

/**
 * Validate relationship constraints across all assignments
 */
function validateRelationshipConstraints(
  assignments: ShiftAssignment[],
  constraints: RelationshipConstraint[]
): GenerationWarning[] {
  const warnings: GenerationWarning[] = []

  // Group assignments by date
  const byDate = new Map<string, ShiftAssignment[]>()
  for (const assignment of assignments) {
    const key = new Date(assignment.date).toDateString()
    if (!byDate.has(key)) {
      byDate.set(key, [])
    }
    byDate.get(key)!.push(assignment)
  }

  // Check each constraint
  for (const constraint of constraints) {
    if (constraint.constraintType === 'SAME_DAY_OFF') {
      // Check if all constrained users have the same days off
      const userIds = constraint.userIds

      for (const [dateStr, dayAssignments] of byDate) {
        const workingUsers = dayAssignments
          .filter(a => userIds.includes(a.userId))
          .map(a => a.userId)

        const notWorkingUsers = userIds.filter(id => !workingUsers.includes(id))

        // If some work and some don't, it's a violation
        if (workingUsers.length > 0 && notWorkingUsers.length > 0) {
          warnings.push({
            type: 'SOFT_CONSTRAINT_VIOLATED',
            message: 'Alcuni dipendenti lavorano mentre altri no (vincolo stesso giorno libero)',
            date: new Date(dateStr),
            severity: constraint.isHardConstraint ? 'high' : 'low',
          })
        }
      }
    }
  }

  return warnings
}

/**
 * Calculate generation statistics
 */
function calculateStats(
  assignments: ShiftAssignment[],
  employees: Employee[],
  params: GenerationParams
): GenerationStats {
  const totalShifts = assignments.length
  const totalHours = assignments.reduce((sum, a) => sum + a.hoursScheduled, 0)
  const totalCost = assignments.reduce((sum, a) => sum + a.costEstimated, 0)

  // Calculate per-employee stats
  const employeeStats: EmployeeStats[] = []
  const employeeMap = new Map(employees.map(e => [e.id, e]))

  const assignmentsByEmployee = new Map<string, ShiftAssignment[]>()
  for (const assignment of assignments) {
    if (!assignmentsByEmployee.has(assignment.userId)) {
      assignmentsByEmployee.set(assignment.userId, [])
    }
    assignmentsByEmployee.get(assignment.userId)!.push(assignment)
  }

  for (const [userId, empAssignments] of assignmentsByEmployee) {
    const employee = employeeMap.get(userId)
    if (!employee) continue

    const shiftsAssigned = empAssignments.length
    const hoursAssigned = empAssignments.reduce((sum, a) => sum + a.hoursScheduled, 0)
    const costEstimated = empAssignments.reduce((sum, a) => sum + a.costEstimated, 0)
    const contractHoursWeek = employee.contractHoursWeek

    // Calculate weeks in period
    const startDate = new Date(params.startDate)
    const endDate = new Date(params.endDate)
    const weeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))

    const expectedHours = contractHoursWeek ? contractHoursWeek * weeks : 40 * weeks
    const utilizationPercentage = (hoursAssigned / expectedHours) * 100

    employeeStats.push({
      userId,
      name: `${employee.firstName} ${employee.lastName}`,
      shiftsAssigned,
      hoursAssigned,
      costEstimated,
      contractHoursWeek,
      utilizationPercentage,
    })
  }

  // Sort by hours assigned
  employeeStats.sort((a, b) => b.hoursAssigned - a.hoursAssigned)

  // Calculate coverage percentage (simplified)
  // A more accurate calculation would need shift requirements
  const coveragePercentage = 100 // Assume 100% for now, adjust based on warnings

  return {
    totalShifts,
    totalHours,
    totalCost,
    employeeStats,
    coveragePercentage,
    softConstraintsViolated: 0, // Will be updated based on warnings
  }
}

/**
 * Optimize an existing schedule (local search)
 */
export function optimizeSchedule(
  assignments: ShiftAssignment[],
  context: SolverContext
): { assignments: ShiftAssignment[]; improved: boolean } {
  // Simple local search: try swapping assignments
  let improved = false
  const newAssignments = [...assignments]

  for (let i = 0; i < newAssignments.length; i++) {
    for (let j = i + 1; j < newAssignments.length; j++) {
      const a1 = newAssignments[i]
      const a2 = newAssignments[j]

      // Only consider swapping same-day, same-shift assignments
      if (
        a1.date.toDateString() !== a2.date.toDateString() ||
        a1.shiftDefinitionId !== a2.shiftDefinitionId
      ) {
        continue
      }

      // Try swap
      const temp = { ...a1, userId: a2.userId }
      const temp2 = { ...a2, userId: a1.userId }

      // Check if swap is valid
      const e1 = context.employees.find(e => e.id === a2.userId)
      const e2 = context.employees.find(e => e.id === a1.userId)
      if (!e1 || !e2) continue

      const shift = context.shiftDefinitions.find(s => s.id === a1.shiftDefinitionId)
      if (!shift) continue

      const constraints1 = context.employeeConstraints.get(a2.userId) || []
      const constraints2 = context.employeeConstraints.get(a1.userId) || []

      const canSwap1 = canEmployeeWorkShift(e1, shift, a1.date, constraints1, newAssignments.filter((_, idx) => idx !== i && idx !== j))
      const canSwap2 = canEmployeeWorkShift(e2, shift, a2.date, constraints2, newAssignments.filter((_, idx) => idx !== i && idx !== j))

      if (canSwap1.canWork && canSwap2.canWork) {
        // Calculate old and new scores
        const oldScore1 = calculateEmployeeScore(context.employees.find(e => e.id === a1.userId)!, shift, a1.date, context.employeeConstraints.get(a1.userId) || [], newAssignments, context.params)
        const oldScore2 = calculateEmployeeScore(context.employees.find(e => e.id === a2.userId)!, shift, a2.date, context.employeeConstraints.get(a2.userId) || [], newAssignments, context.params)

        const newScore1 = calculateEmployeeScore(e1, shift, a1.date, constraints1, newAssignments, context.params)
        const newScore2 = calculateEmployeeScore(e2, shift, a2.date, constraints2, newAssignments, context.params)

        if (newScore1 + newScore2 > oldScore1 + oldScore2) {
          // Accept swap
          newAssignments[i] = temp
          newAssignments[j] = temp2
          improved = true
        }
      }
    }
  }

  return { assignments: newAssignments, improved }
}
