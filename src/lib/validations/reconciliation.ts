import { z } from 'zod'

// Enum validations
export const importSourceSchema = z.enum([
  'CSV',
  'XLSX',
  'CBI_XML',
  'CBI_TXT',
  'PSD2_FABRICK',
  'PSD2_TINK',
  'PSD2_GOCARDLESS',
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

// Creazione manuale: la riga inserita a mano ha un conto come tutte le altre.
// `descrizione` è il testo dell'utente e finisce anche in `description`, che
// per le righe MANUAL non è «della banca» ma resta il testo d'origine.
export const createBankTransactionSchema = z.object({
  bankAccountId: z.string().min(1),
  transactionDate: z.string(), // ISO date
  valueDate: z.string().optional(),
  descrizione: z.string().min(1).max(500),
  causale: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
  amount: z.number().refine((n) => n !== 0, 'L\'importo non può essere zero'), // + entrata, - uscita
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
export type CreateBankTransaction = z.infer<typeof createBankTransactionSchema>
export type MatchTransaction = z.infer<typeof matchTransactionSchema>
export type CreateEntryFromTransaction = z.infer<typeof createEntryFromTransactionSchema>
export type ReconcileParams = z.infer<typeof reconcileSchema>
export type CSVParserConfig = z.infer<typeof csvParserConfigSchema>
export type ImportBatchParams = z.infer<typeof importBatchSchema>
export type SummaryQuery = z.infer<typeof summaryQuerySchema>
