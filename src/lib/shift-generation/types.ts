/**
 * Types for shift generation algorithm
 */

export interface Employee {
  id: string
  firstName: string
  lastName: string
  isFixedStaff: boolean
  contractType: 'TEMPO_DETERMINATO' | 'TEMPO_INDETERMINATO' | 'LAVORO_INTERMITTENTE' | 'LAVORATORE_OCCASIONALE' | 'LIBERO_PROFESSIONISTA' | null
  contractHoursWeek: number | null
  venueId: string | null
  skills: string[]
  canWorkAlone: boolean
  canHandleCash: boolean
  hourlyRateBase: number | null
  hourlyRateExtra: number | null
  hourlyRateHoliday: number | null
  hourlyRateNight: number | null
  defaultShift: 'MORNING' | 'EVENING' | null  // Turno preferito del dipendente
  availableDays: number[]  // Giorni disponibili: 0=LUN, 1=MAR, ..., 6=DOM
  workDaysPerWeek: number | null  // Giorni lavorativi settimanali (solo staff fisso)
}

export interface LeaveRequest {
  id: string
  userId: string
  startDate: Date
  endDate: Date
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
}

export interface ShiftDefinition {
  id: string
  venueId: string
  name: string
  code: string
  color: string | null
  startTime: Date
  endTime: Date
  breakMinutes: number
  minStaff: number
  maxStaff: number | null
  requiredSkills: string[]
  rateMultiplier: number
  position: number
}

export interface EmployeeConstraint {
  id: string
  userId: string
  constraintType: ConstraintType
  config: Record<string, unknown>
  validFrom: Date | null
  validTo: Date | null
  priority: number
  isHardConstraint: boolean
  venueId: string | null
}

export interface RelationshipConstraint {
  id: string
  constraintType: RelConstraintType
  config: Record<string, unknown>
  validFrom: Date | null
  validTo: Date | null
  priority: number
  isHardConstraint: boolean
  venueId: string | null
  userIds: string[]
}

export type ConstraintType =
  | 'AVAILABILITY'
  | 'MAX_HOURS'
  | 'MIN_REST'
  | 'PREFERRED_SHIFT'
  | 'BLOCKED_DAY'
  | 'SKILL_REQUIRED'
  | 'CONSECUTIVE_DAYS'

export type RelConstraintType =
  | 'SAME_DAY_OFF'
  | 'NEVER_TOGETHER'
  | 'ALWAYS_TOGETHER'
  | 'MIN_OVERLAP'
  | 'MAX_TOGETHER'

export interface ShiftRequirement {
  date: Date
  shiftDefinition: ShiftDefinition
  minStaff: number
  maxStaff: number
  requiredSkills: string[]
}

export interface ShiftAssignment {
  id?: string
  scheduleId: string
  userId: string
  shiftDefinitionId: string
  date: Date
  startTime: Date
  endTime: Date
  breakMinutes: number
  venueId: string
  workStation?: string
  hoursScheduled: number
  costEstimated: number
}

export interface GenerationParams {
  venueId: string
  startDate: Date
  endDate: Date
  preferFixedStaff: boolean
  balanceHours: boolean
  minimizeCost: boolean
  staffingRequirements?: Record<string, number> // key: `${dateString}_${shiftDefId}`, value: minStaff
}

export interface GenerationResult {
  success: boolean
  assignments: ShiftAssignment[]
  warnings: GenerationWarning[]
  stats: GenerationStats
}

export interface GenerationWarning {
  type: 'UNDERSTAFFED' | 'SOFT_CONSTRAINT_VIOLATED' | 'HIGH_COST' | 'UNBALANCED_HOURS'
  message: string
  date: Date
  shiftDefinitionId?: string
  employeeId?: string
  severity: 'low' | 'medium' | 'high'
}

export interface GenerationStats {
  totalShifts: number
  totalHours: number
  totalCost: number
  employeeStats: EmployeeStats[]
  coveragePercentage: number
  softConstraintsViolated: number
}

export interface EmployeeStats {
  userId: string
  name: string
  shiftsAssigned: number
  hoursAssigned: number
  costEstimated: number
  contractHoursWeek: number | null
  utilizationPercentage: number
}

export interface EmployeeAvailability {
  userId: string
  date: Date
  isAvailable: boolean
  availableFrom?: string // HH:MM
  availableTo?: string // HH:MM
  reason?: string
}

export interface DaySchedule {
  date: Date
  shifts: {
    shiftDefinition: ShiftDefinition
    assignments: ShiftAssignment[]
    minStaff: number
    currentStaff: number
    isCovered: boolean
  }[]
}

export interface ScheduleValidationResult {
  isValid: boolean
  hardConstraintViolations: ConstraintViolation[]
  softConstraintViolations: ConstraintViolation[]
}

export interface ConstraintViolation {
  constraintId: string
  constraintType: ConstraintType | RelConstraintType
  message: string
  employeeIds: string[]
  date: Date
  severity: 'hard' | 'soft'
}
