/**
 * Schemi Zod per validazione modulo presenze
 */
import { z } from 'zod'

/**
 * Tipi di timbratura
 */
export const PunchTypeSchema = z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END'])

/**
 * Schema per timbratura
 */
export const PunchSchema = z.object({
  punchType: PunchTypeSchema,
  venueId: z.string().uuid(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
})

/**
 * Schema per timbratura manuale (admin)
 */
export const ManualPunchSchema = z.object({
  staffMemberId: z.string().uuid(),
  venueId: z.string().uuid(),
  punchType: PunchTypeSchema,
  punchTime: z.coerce.date(),
  notes: z.string().max(500).optional(),
})

/**
 * Schema per policy presenze
 */
export const AttendancePolicySchema = z.object({
  venueId: z.string().uuid(),
  maxLateMinutes: z.number().int().min(0).max(120).default(15),
  maxEarlyLeaveMinutes: z.number().int().min(0).max(120).default(15),
  autoClockoutHours: z.number().min(1).max(24).default(12),
  requireGps: z.boolean().default(false),
  gpsRadiusMeters: z.number().int().min(10).max(1000).default(100),
  requirePhoto: z.boolean().default(false),
  allowOfflinePunch: z.boolean().default(true),
})

/**
 * Schema per risoluzione anomalia
 */
export const ResolveAnomalySchema = z.object({
  resolution: z.enum(['APPROVED', 'REJECTED', 'ADJUSTED']),
  adjustedTime: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
})

/**
 * Schema per query parametri lista presenze
 */
export const AttendanceQuerySchema = z.object({
  venueId: z.string().uuid().optional(),
  staffMemberId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

/**
 * Schema per export payroll
 */
export const PayrollExportSchema = z.object({
  venueId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

export type Punch = z.infer<typeof PunchSchema>
export type ManualPunch = z.infer<typeof ManualPunchSchema>
export type AttendancePolicy = z.infer<typeof AttendancePolicySchema>
export type ResolveAnomaly = z.infer<typeof ResolveAnomalySchema>
export type AttendanceQuery = z.infer<typeof AttendanceQuerySchema>
export type PayrollExport = z.infer<typeof PayrollExportSchema>
