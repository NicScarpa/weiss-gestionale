/**
 * Schemi Zod per validazione transazioni bancarie
 */
import { z } from 'zod'

/**
 * Schema per import transazioni CSV
 */
export const BankTransactionImportSchema = z.object({
  csvContent: z.string().min(1, 'Contenuto CSV richiesto'),
  venueId: z.string().uuid(),
  bankName: z.string().min(1).max(100).optional(),
})

/**
 * Schema per transazione bancaria singola
 */
export const BankTransactionSchema = z.object({
  date: z.coerce.date(),
  description: z.string().min(1).max(500),
  amount: z.number(),
  reference: z.string().max(100).optional(),
  venueId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
})

/**
 * Schema per match manuale transazione
 */
export const MatchTransactionSchema = z.object({
  journalEntryId: z.string().uuid(),
  notes: z.string().max(500).optional(),
})

/**
 * Schema per conferma transazione
 */
export const ConfirmTransactionSchema = z.object({
  accountId: z.string().uuid(),
  notes: z.string().max(500).optional(),
})

/**
 * Schema per query parametri lista transazioni
 */
export const BankTransactionQuerySchema = z.object({
  venueId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'MATCHED', 'CONFIRMED', 'IGNORED']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type BankTransactionImport = z.infer<typeof BankTransactionImportSchema>
export type BankTransaction = z.infer<typeof BankTransactionSchema>
export type MatchTransaction = z.infer<typeof MatchTransactionSchema>
export type ConfirmTransaction = z.infer<typeof ConfirmTransactionSchema>
export type BankTransactionQuery = z.infer<typeof BankTransactionQuerySchema>
