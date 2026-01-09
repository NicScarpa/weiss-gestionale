/**
 * Shift Generation Library
 *
 * Entry point for generating shift schedules using constraint-based algorithms.
 */

import { prisma } from '@/lib/prisma'
import {
  Employee,
  ShiftDefinition,
  EmployeeConstraint,
  RelationshipConstraint,
  GenerationParams,
  GenerationResult,
  ShiftAssignment,
  LeaveRequest,
} from './types'
import { generateShiftsGreedy, optimizeSchedule } from './greedy-solver'

export * from './types'
export * from './constraints'
export * from './greedy-solver'

/**
 * Main function to generate shifts for a schedule
 */
export async function generateShifts(
  scheduleId: string,
  params: GenerationParams
): Promise<GenerationResult> {
  // Load employees
  const employees = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { venueId: params.venueId },
        { venueId: null }, // Include employees without a specific venue
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isFixedStaff: true,
      contractType: true,
      contractHoursWeek: true,
      venueId: true,
      skills: true,
      canWorkAlone: true,
      canHandleCash: true,
      hourlyRateBase: true,
      hourlyRateExtra: true,
      hourlyRateHoliday: true,
      hourlyRateNight: true,
      defaultShift: true,      // Turno preferito (MORNING/EVENING)
      availableDays: true,     // Giorni disponibili per staff extra
    },
  })

  // Load approved leave requests for the period
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      userId: { in: employees.map(e => e.id) },
      status: 'APPROVED',
      OR: [
        // Leave starts during the period
        {
          startDate: {
            gte: params.startDate,
            lte: params.endDate,
          },
        },
        // Leave ends during the period
        {
          endDate: {
            gte: params.startDate,
            lte: params.endDate,
          },
        },
        // Leave spans the entire period
        {
          startDate: { lte: params.startDate },
          endDate: { gte: params.endDate },
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  })

  const typedLeaveRequests: LeaveRequest[] = leaveRequests.map(lr => ({
    id: lr.id,
    userId: lr.userId,
    startDate: lr.startDate,
    endDate: lr.endDate,
    status: lr.status as LeaveRequest['status'],
  }))

  // Load shift definitions
  const shiftDefinitions = await prisma.shiftDefinition.findMany({
    where: {
      venueId: params.venueId,
      isActive: true,
    },
    orderBy: {
      position: 'desc',
    },
  })

  // Load employee constraints
  const allConstraints = await prisma.employeeConstraint.findMany({
    where: {
      userId: { in: employees.map(e => e.id) },
      OR: [
        { venueId: params.venueId },
        { venueId: null },
      ],
    },
  })

  // Group constraints by employee
  const employeeConstraints = new Map<string, EmployeeConstraint[]>()
  for (const constraint of allConstraints) {
    if (!employeeConstraints.has(constraint.userId)) {
      employeeConstraints.set(constraint.userId, [])
    }
    employeeConstraints.get(constraint.userId)!.push({
      ...constraint,
      config: constraint.config as Record<string, unknown>,
    })
  }

  // Load relationship constraints
  const relConstraintsRaw = await prisma.relationshipConstraint.findMany({
    where: {
      OR: [
        { venueId: params.venueId },
        { venueId: null },
      ],
    },
    include: {
      users: true,
    },
  })

  const relationshipConstraints: RelationshipConstraint[] = relConstraintsRaw.map(rc => ({
    ...rc,
    config: rc.config as Record<string, unknown>,
    userIds: rc.users.map(u => u.userId),
  }))

  // Map to typed objects
  const typedEmployees: Employee[] = employees.map(e => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    isFixedStaff: e.isFixedStaff,
    contractType: e.contractType as Employee['contractType'],
    contractHoursWeek: e.contractHoursWeek ? Number(e.contractHoursWeek) : null,
    venueId: e.venueId,
    skills: e.skills,
    canWorkAlone: e.canWorkAlone,
    canHandleCash: e.canHandleCash,
    hourlyRateBase: e.hourlyRateBase ? Number(e.hourlyRateBase) : null,
    hourlyRateExtra: e.hourlyRateExtra ? Number(e.hourlyRateExtra) : null,
    hourlyRateHoliday: e.hourlyRateHoliday ? Number(e.hourlyRateHoliday) : null,
    hourlyRateNight: e.hourlyRateNight ? Number(e.hourlyRateNight) : null,
    defaultShift: e.defaultShift as Employee['defaultShift'],
    availableDays: e.availableDays,
  }))

  const typedShiftDefinitions: ShiftDefinition[] = shiftDefinitions.map(sd => ({
    id: sd.id,
    venueId: sd.venueId,
    name: sd.name,
    code: sd.code,
    color: sd.color,
    startTime: sd.startTime,
    endTime: sd.endTime,
    breakMinutes: sd.breakMinutes,
    minStaff: sd.minStaff,
    maxStaff: sd.maxStaff,
    requiredSkills: sd.requiredSkills,
    rateMultiplier: Number(sd.rateMultiplier),
    position: sd.position,
  }))

  // Run greedy algorithm
  const result = generateShiftsGreedy({
    employees: typedEmployees,
    shiftDefinitions: typedShiftDefinitions,
    employeeConstraints,
    relationshipConstraints,
    leaveRequests: typedLeaveRequests,
    params,
    scheduleId,
  })

  // Try to optimize
  const optimized = optimizeSchedule(result.assignments, {
    employees: typedEmployees,
    shiftDefinitions: typedShiftDefinitions,
    employeeConstraints,
    relationshipConstraints,
    leaveRequests: typedLeaveRequests,
    params,
    scheduleId,
  })

  if (optimized.improved) {
    result.assignments = optimized.assignments
  }

  return result
}

/**
 * Save generated assignments to database
 */
export async function saveAssignments(
  scheduleId: string,
  assignments: ShiftAssignment[]
): Promise<void> {
  // Delete existing assignments for this schedule
  await prisma.shiftAssignment.deleteMany({
    where: { scheduleId },
  })

  // Create new assignments
  await prisma.shiftAssignment.createMany({
    data: assignments.map(a => ({
      scheduleId: a.scheduleId,
      userId: a.userId,
      shiftDefinitionId: a.shiftDefinitionId,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      breakMinutes: a.breakMinutes,
      venueId: a.venueId,
      workStation: a.workStation,
      hoursScheduled: a.hoursScheduled,
      costEstimated: a.costEstimated,
      status: 'SCHEDULED',
    })),
  })
}

/**
 * Load existing assignments for a schedule
 */
export async function loadAssignments(scheduleId: string): Promise<ShiftAssignment[]> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: { scheduleId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      shiftDefinition: {
        select: {
          id: true,
          name: true,
          code: true,
          color: true,
        },
      },
    },
    orderBy: [
      { date: 'asc' },
      { startTime: 'asc' },
    ],
  })

  return assignments.map(a => ({
    id: a.id,
    scheduleId: a.scheduleId,
    userId: a.userId,
    shiftDefinitionId: a.shiftDefinitionId || '',
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    breakMinutes: a.breakMinutes,
    venueId: a.venueId,
    workStation: a.workStation || undefined,
    hoursScheduled: a.hoursScheduled ? Number(a.hoursScheduled) : 0,
    costEstimated: a.costEstimated ? Number(a.costEstimated) : 0,
  }))
}

/**
 * Validate an existing schedule
 */
export async function validateSchedule(scheduleId: string): Promise<{
  isValid: boolean
  warnings: { type: string; message: string; severity: string }[]
}> {
  const schedule = await prisma.shiftSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      assignments: true,
    },
  })

  if (!schedule) {
    return {
      isValid: false,
      warnings: [{ type: 'ERROR', message: 'Pianificazione non trovata', severity: 'high' }],
    }
  }

  const warnings: { type: string; message: string; severity: string }[] = []

  // Check for understaffed shifts
  const shiftDefinitions = await prisma.shiftDefinition.findMany({
    where: {
      venueId: schedule.venueId,
      isActive: true,
    },
  })

  // Group assignments by date and shift
  const byDateShift = new Map<string, number>()
  for (const assignment of schedule.assignments) {
    const key = `${assignment.date.toDateString()}_${assignment.shiftDefinitionId}`
    byDateShift.set(key, (byDateShift.get(key) || 0) + 1)
  }

  // Generate all dates in range
  const dates: Date[] = []
  const currentDate = new Date(schedule.startDate)
  while (currentDate <= schedule.endDate) {
    dates.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Check each date/shift combination
  for (const date of dates) {
    for (const shift of shiftDefinitions) {
      const key = `${date.toDateString()}_${shift.id}`
      const count = byDateShift.get(key) || 0

      if (count < shift.minStaff) {
        warnings.push({
          type: 'UNDERSTAFFED',
          message: `${shift.name} del ${date.toLocaleDateString('it-IT')}: ${count}/${shift.minStaff} dipendenti`,
          severity: 'high',
        })
      }
    }
  }

  return {
    isValid: warnings.filter(w => w.severity === 'high').length === 0,
    warnings,
  }
}
