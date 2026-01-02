import { z } from 'zod'

// Schema per tipo registro
export const registerTypeSchema = z.enum(['CASH', 'BANK'])

// Schema per tipo movimento
export const entryTypeSchema = z.enum([
  'INCASSO',
  'USCITA',
  'VERSAMENTO',
  'PRELIEVO',
  'GIROCONTO',
])

// Schema per creazione movimento manuale
export const createJournalEntrySchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  registerType: registerTypeSchema,
  entryType: entryTypeSchema,
  amount: z.number().positive({ message: 'L\'importo deve essere positivo' }),
  description: z.string().min(1, { message: 'La descrizione è obbligatoria' }),
  documentRef: z.string().optional(),
  documentType: z.string().optional(),
  accountId: z.string().optional(),
  vatAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// Schema per aggiornamento movimento
export const updateJournalEntrySchema = z.object({
  date: z.string().transform((s) => new Date(s)).optional(),
  description: z.string().min(1).optional(),
  documentRef: z.string().optional(),
  documentType: z.string().optional(),
  accountId: z.string().optional(),
  vatAmount: z.number().min(0).optional(),
})

// Schema per versamento cassa-banca
export const bankDepositSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  amount: z.number().positive({ message: 'L\'importo deve essere positivo' }),
  description: z.string().optional(),
  documentRef: z.string().optional(),
})

// Schema filtri lista
export const journalEntryFiltersSchema = z.object({
  registerType: registerTypeSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  entryType: entryTypeSchema.optional(),
  accountId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

// Tipi inferiti
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>
export type BankDepositInput = z.infer<typeof bankDepositSchema>
export type JournalEntryFiltersInput = z.infer<typeof journalEntryFiltersSchema>
