/**
 * Schemi Zod per validazione fatture
 */
import { z } from 'zod'

/**
 * Tipi documento fattura
 */
export const InvoiceDocumentTypeSchema = z.enum([
  'FATTURA',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
  'AUTOFATTURA',
])

/**
 * Schema per parse fattura XML
 */
export const ParseInvoiceSchema = z.object({
  xmlContent: z.string().min(1, 'Contenuto XML richiesto'),
  fileName: z.string().max(255).optional(),
})

/**
 * Schema per import fattura
 */
export const ImportInvoiceSchema = z.object({
  xmlContent: z.string().min(1, 'Contenuto XML richiesto'),
  venueId: z.string().uuid(),
  fileName: z.string().max(255).optional(),
})

/**
 * Schema per registrazione fattura in prima nota
 */
export const RecordInvoiceSchema = z.object({
  accountId: z.string().uuid(),
  notes: z.string().max(500).optional(),
  paymentDate: z.coerce.date().optional(),
})

/**
 * Schema per aggiornamento fattura
 */
export const UpdateInvoiceSchema = z.object({
  venueId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['PENDING', 'RECORDED', 'PAID']).optional(),
})

/**
 * Schema per bulk delete fatture
 */
export const BulkDeleteInvoicesSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1, 'Seleziona almeno una fattura'),
})

/**
 * Schema per query parametri lista fatture
 */
export const InvoiceQuerySchema = z.object({
  venueId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'RECORDED', 'PAID']).optional(),
  documentType: InvoiceDocumentTypeSchema.optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type InvoiceDocumentType = z.infer<typeof InvoiceDocumentTypeSchema>
export type ParseInvoice = z.infer<typeof ParseInvoiceSchema>
export type ImportInvoice = z.infer<typeof ImportInvoiceSchema>
export type RecordInvoice = z.infer<typeof RecordInvoiceSchema>
export type UpdateInvoice = z.infer<typeof UpdateInvoiceSchema>
export type BulkDeleteInvoices = z.infer<typeof BulkDeleteInvoicesSchema>
export type InvoiceQuery = z.infer<typeof InvoiceQuerySchema>
