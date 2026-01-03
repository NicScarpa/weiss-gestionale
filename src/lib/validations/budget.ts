import { z } from 'zod'

// Schema per stato budget
export const budgetStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])

// Schema per tipo alert
export const budgetAlertTypeSchema = z.enum(['OVER_BUDGET', 'UNDER_REVENUE'])

// Schema per stato alert
export const alertStatusSchema = z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'])

// Schema per valori mensili (comune per le righe budget)
const monthlyValueSchema = z.coerce.number().min(0).default(0)

// Schema per creazione budget
export const createBudgetSchema = z.object({
  venueId: z.string().min(1, { message: 'La sede è obbligatoria' }),
  year: z.coerce.number().int().min(2020).max(2100, { message: 'Anno non valido' }),
  name: z.string().optional(),
  notes: z.string().optional(),
  copyFromYear: z.coerce.number().int().optional(),
})

// Schema per aggiornamento budget
export const updateBudgetSchema = z.object({
  name: z.string().optional(),
  status: budgetStatusSchema.optional(),
  notes: z.string().optional(),
})

// Schema per riga budget
export const budgetLineSchema = z.object({
  accountId: z.string().min(1, { message: 'Il conto è obbligatorio' }),
  jan: monthlyValueSchema,
  feb: monthlyValueSchema,
  mar: monthlyValueSchema,
  apr: monthlyValueSchema,
  may: monthlyValueSchema,
  jun: monthlyValueSchema,
  jul: monthlyValueSchema,
  aug: monthlyValueSchema,
  sep: monthlyValueSchema,
  oct: monthlyValueSchema,
  nov: monthlyValueSchema,
  dec: monthlyValueSchema,
  notes: z.string().optional(),
})

// Schema per creazione/aggiornamento righe budget (array)
export const upsertBudgetLinesSchema = z.object({
  lines: z.array(budgetLineSchema).min(1, { message: 'Almeno una riga è richiesta' }),
})

// Schema per filtri lista budget
export const budgetFiltersSchema = z.object({
  venueId: z.string().optional(),
  year: z.coerce.number().int().optional(),
  status: budgetStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// Schema per filtri confronto
export const budgetComparisonFiltersSchema = z.object({
  venueId: z.string().optional(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  accountType: z.enum(['RICAVO', 'COSTO', 'ALL']).optional().default('ALL'),
})

// Schema per acknowledge alert
export const acknowledgeAlertSchema = z.object({
  alertId: z.string().min(1),
})

// Schema per filtri alert
export const alertFiltersSchema = z.object({
  venueId: z.string().optional(),
  year: z.coerce.number().int().optional(),
  status: alertStatusSchema.optional(),
  alertType: budgetAlertTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// Tipi inferiti
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>
export type BudgetLineInput = z.infer<typeof budgetLineSchema>
export type UpsertBudgetLinesInput = z.infer<typeof upsertBudgetLinesSchema>
export type BudgetFiltersInput = z.infer<typeof budgetFiltersSchema>
export type BudgetComparisonFiltersInput = z.infer<typeof budgetComparisonFiltersSchema>
export type AcknowledgeAlertInput = z.infer<typeof acknowledgeAlertSchema>
export type AlertFiltersInput = z.infer<typeof alertFiltersSchema>
