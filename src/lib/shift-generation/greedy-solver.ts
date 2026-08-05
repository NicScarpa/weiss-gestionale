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
  ConstraintViolation,
} from './types'
import {
  canEmployeeWorkShift,
  calculateShiftHours,
  checkRelationshipConstraints,
  checkWeeklyRelationshipConstraints,
  calculateEmployeeScore,
  formatDateKey,
  getWeekKey,
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
 * Count unique days worked by an employee in a specific week
 */
function countDaysWorkedInWeek(
  employeeId: string,
  date: Date,
  existingAssignments: ShiftAssignment[],
  currentAssignments: ShiftAssignment[]
): number {
  const weekStart = getWeekKey(date)
  const uniqueDays = new Set<string>()

  // Check existing assignments
  for (const assignment of existingAssignments) {
    if (assignment.userId !== employeeId) continue
    const assignmentWeek = getWeekKey(assignment.date)
    if (assignmentWeek === weekStart) {
      uniqueDays.add(formatDateKey(assignment.date))
    }
  }

  // Check current iteration assignments
  for (const assignment of currentAssignments) {
    if (assignment.userId !== employeeId) continue
    const assignmentWeek = getWeekKey(assignment.date)
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
        scheduleId,
        shiftDefinitions
      )

      assignments.push(...shiftAssignments.assignments)
      warnings.push(...shiftAssignments.warnings)
    }
  }

  // Validate relationship constraints across all assignments
  const relWarnings = validateRelationshipConstraints(
    assignments,
    relationshipConstraints,
    shiftDefinitions,
    dates
  )
  warnings.push(...relWarnings)

  // Segnala i dipendenti assegnati senza tariffa oraria: il loro costo non è
  // stimabile e resta fuori dal totale
  warnings.push(...buildMissingRateWarnings(assignments, employees))

  // Calculate stats
  const stats = calculateStats(assignments, employees, params)
  stats.softConstraintsViolated = warnings.filter(
    w => w.type === 'SOFT_CONSTRAINT_VIOLATED'
  ).length

  return {
    success: warnings.filter(w => w.severity === 'high').length === 0,
    assignments,
    warnings,
    stats,
  }
}

/**
 * Un warning per ogni dipendente assegnato che non ha `hourlyRateBase`.
 * La stima costi lo esclude invece di usare una tariffa inventata.
 */
function buildMissingRateWarnings(
  assignments: ShiftAssignment[],
  employees: Employee[]
): GenerationWarning[] {
  const employeeMap = new Map(employees.map(e => [e.id, e]))
  const reported = new Set<string>()
  const warnings: GenerationWarning[] = []

  for (const assignment of assignments) {
    if (reported.has(assignment.userId)) continue
    const employee = employeeMap.get(assignment.userId)
    if (!employee || employee.hourlyRateBase) continue

    reported.add(assignment.userId)
    warnings.push({
      type: 'MISSING_RATE',
      message: `Tariffa oraria mancante per ${employee.firstName} ${employee.lastName}: i suoi turni sono esclusi dalla stima costi`,
      date: assignment.date,
      employeeId: employee.id,
      employeeIds: [employee.id],
      severity: 'medium',
    })
  }

  return warnings
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
  scheduleId: string,
  shiftDefinitions: ShiftDefinition[]
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

    const shiftHours = calculateShiftHours(shift)
    const candidateAssignment: ShiftAssignment = {
      scheduleId,
      userId: candidate.employee.id,
      shiftDefinitionId: shift.id,
      date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      venueId: shift.venueId,
      hoursScheduled: shiftHours,
      costEstimated: 0,
    }

    // Check relationship constraints with already assigned employees.
    // Il confronto include le assegnazioni degli altri turni dello stesso
    // giorno (existingAssignments), non solo quelle del turno corrente:
    // MIN_OVERLAP e ALWAYS_TOGETHER mettono in relazione turni diversi.
    let hasHardViolation = false
    for (const otherAssignment of [...existingAssignments, ...assignments]) {
      if (otherAssignment.userId === candidate.employee.id) continue

      const violations = checkRelationshipConstraints(
        { userId: candidate.employee.id, date, shiftDefinitionId: shift.id },
        { userId: otherAssignment.userId, date: otherAssignment.date, shiftDefinitionId: otherAssignment.shiftDefinitionId },
        relationshipConstraints,
        shiftDefinitions
      )

      const hardViolations = violations.filter(v => v.severity === 'hard')
      if (hardViolations.length > 0) {
        hasHardViolation = true
        break
      }
    }

    if (hasHardViolation) continue

    // MAX_TOGETHER è settimanale: si verifica simulando l'aggiunta del candidato
    const weeklyViolations = checkWeeklyRelationshipConstraints(
      [...existingAssignments, ...assignments, candidateAssignment],
      relationshipConstraints.filter(c => c.constraintType === 'MAX_TOGETHER' && c.isHardConstraint)
    )
    if (weeklyViolations.some(v => v.severity === 'hard')) continue

    // Create assignment. Senza tariffa oraria il costo non si stima: resta 0 e
    // viene segnalato come MISSING_RATE, mai sostituito da un valore inventato.
    const hourlyRate = candidate.employee.hourlyRateBase
    const costEstimated = hourlyRate ? shiftHours * hourlyRate * Number(shift.rateMultiplier) : 0

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
 *
 * Ripassa il piano completo: i vincoli a coppie (NEVER_TOGETHER,
 * ALWAYS_TOGETHER, MIN_OVERLAP) sullo stesso giorno e quelli settimanali
 * (SAME_DAY_OFF, MAX_TOGETHER). I hard violati qui sopravvivono al greedy solo
 * quando erano inevitabili, quindi vanno riportati con severità alta.
 */
export function validateRelationshipConstraints(
  assignments: ShiftAssignment[],
  constraints: RelationshipConstraint[],
  shiftDefinitions: ShiftDefinition[] = [],
  daysInPeriod: Date[] = []
): GenerationWarning[] {
  if (constraints.length === 0) return []

  const violations: ConstraintViolation[] = []

  // Vincoli a coppie: solo assegnazioni dello stesso giorno
  const byDate = new Map<string, ShiftAssignment[]>()
  for (const assignment of assignments) {
    const key = formatDateKey(new Date(assignment.date))
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(assignment)
  }

  for (const [, dayAssignments] of byDate) {
    for (let i = 0; i < dayAssignments.length; i++) {
      for (let j = i + 1; j < dayAssignments.length; j++) {
        const a1 = dayAssignments[i]
        const a2 = dayAssignments[j]
        violations.push(
          ...checkRelationshipConstraints(
            { userId: a1.userId, date: new Date(a1.date), shiftDefinitionId: a1.shiftDefinitionId },
            { userId: a2.userId, date: new Date(a2.date), shiftDefinitionId: a2.shiftDefinitionId },
            constraints,
            shiftDefinitions
          )
        )
      }
    }
  }

  // Vincoli settimanali
  violations.push(
    ...checkWeeklyRelationshipConstraints(assignments, constraints, { daysInPeriod })
  )

  // Deduplica: la stessa violazione può emergere da più coppie dello stesso turno
  const seen = new Set<string>()
  const warnings: GenerationWarning[] = []

  for (const violation of violations) {
    const key = `${violation.constraintId}_${formatDateKey(violation.date)}_${[...violation.employeeIds].sort().join('-')}`
    if (seen.has(key)) continue
    seen.add(key)

    warnings.push({
      type: violation.severity === 'hard' ? 'HARD_CONSTRAINT_VIOLATED' : 'SOFT_CONSTRAINT_VIOLATED',
      message: violation.message,
      date: violation.date,
      severity: violation.severity === 'hard' ? 'high' : 'low',
      constraintType: violation.constraintType,
      employeeIds: violation.employeeIds,
    })
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

  // Calculate per-employee stats
  const employeeStats: EmployeeStats[] = []
  const employeeMap = new Map(employees.map(e => [e.id, e]))
  const employeesWithoutRate: { userId: string; name: string }[] = []
  let unpricedHours = 0

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

    const hasHourlyRate = Boolean(employee.hourlyRateBase)
    if (!hasHourlyRate) {
      employeesWithoutRate.push({
        userId,
        name: `${employee.firstName} ${employee.lastName}`,
      })
      unpricedHours += hoursAssigned
    }

    employeeStats.push({
      userId,
      name: `${employee.firstName} ${employee.lastName}`,
      shiftsAssigned,
      hoursAssigned,
      costEstimated,
      contractHoursWeek,
      utilizationPercentage,
      hasHourlyRate,
    })
  }

  // Sort by hours assigned
  employeeStats.sort((a, b) => b.hoursAssigned - a.hoursAssigned)

  // Calculate coverage percentage (simplified)
  // A more accurate calculation would need shift requirements
  const coveragePercentage = 100 // Assume 100% for now, adjust based on warnings

  // Somma i soli costi stimabili: le assegnazioni senza tariffa valgono 0
  const totalCost = assignments.reduce((sum, a) => sum + a.costEstimated, 0)

  return {
    totalShifts,
    totalHours,
    totalCost,
    employeeStats,
    coveragePercentage,
    softConstraintsViolated: 0, // Will be updated based on warnings
    costIncomplete: employeesWithoutRate.length > 0,
    employeesWithoutRate,
    unpricedHours,
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
