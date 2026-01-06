import { z } from 'zod'

// Enum validations
export const importSourceSchema = z.enum([
  'CSV',
  'XLSX',
  'CBI_XML',
  'CBI_TXT',
  'PSD2_FABRICK',
  'PSD2_TINK',
  'MANUAL',
])

export const reconciliationStatusSchema = z.enum([
  'PENDING',
  'MATCHED',
  'TO_REVIEW',
  'MANUAL',
  'IGNORED',
  'UNMATCHED',
])

// Query params per lista transazioni
export const bankTransactionFiltersSchema = z.object({
  venueId: z.string().optional(),
  status: reconciliationStatusSchema.optional(),
  dateFrom: z.string().optional(), // ISO date
  dateTo: z.string().optional(), // ISO date
  search: z.string().optional(),
  importBatchId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
})

// Creazione manuale transazione
export const createBankTransactionSchema = z.object({
  venueId: z.string().min(1),
  transactionDate: z.string(), // ISO date
  valueDate: z.string().optional(),
  description: z.string().min(1).max(500),
  amount: z.number(), // + entrata, - uscita
  balanceAfter: z.number().optional(),
  bankReference: z.string().max(100).optional(),
})

// Match manuale
export const matchTransactionSchema = z.object({
  journalEntryId: z.string().min(1),
})

// Creazione movimento dalla transazione
export const createEntryFromTransactionSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().optional(),
  documentRef: z.string().optional(),
})

// Avvia riconciliazione automatica
export const reconcileSchema = z.object({
  venueId: z.string().min(1),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

// Configurazione parser CSV
export const csvParserConfigSchema = z.object({
  delimiter: z.string().default(';'),
  dateFormat: z.string().default('DD/MM/YYYY'),
  decimalSeparator: z.string().default(','),
  thousandSeparator: z.string().default('.'),
  hasHeader: z.boolean().default(true),
  columnMapping: z.object({
    transactionDate: z.union([z.string(), z.number()]),
    valueDate: z.union([z.string(), z.number()]).optional(),
    description: z.union([z.string(), z.number()]),
    amount: z.union([z.string(), z.number()]),
    balance: z.union([z.string(), z.number()]).optional(),
    reference: z.union([z.string(), z.number()]).optional(),
  }),
})

// Import batch info
export const importBatchSchema = z.object({
  venueId: z.string().min(1),
  source: importSourceSchema.default('CSV'),
  config: csvParserConfigSchema.optional(),
})

// Summary query
export const summaryQuerySchema = z.object({
  venueId: z.string().min(1),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

// Types inferiti
export type BankTransactionFilters = z.infer<typeof bankTransactionFiltersSchema>
export type CreateBankTransaction = z.infer<typeof createBankTransactionSchema>
export type MatchTransaction = z.infer<typeof matchTransactionSchema>
export type CreateEntryFromTransaction = z.infer<typeof createEntryFromTransactionSchema>
export type ReconcileParams = z.infer<typeof reconcileSchema>
export type CSVParserConfig = z.infer<typeof csvParserConfigSchema>
export type ImportBatchParams = z.infer<typeof importBatchSchema>
export type SummaryQuery = z.infer<typeof summaryQuerySchema>
