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
  /**
   * Registro di destinazione del giroconto. Gli altri trasferimenti ce l'hanno
   * implicito nel nome — il versamento va in banca, il prelievo in cassa — e i
   * movimenti a riga singola non ne hanno bisogno. La coerenza fra tipo e
   * destinazione la decide `registriDelTrasferimento`, non questo schema, per
   * non tenere la stessa regola in due posti.
   */
  counterRegisterType: registerTypeSchema.optional(),
  amount: z.number().positive({ message: 'L\'importo deve essere positivo' }),
  description: z.string().min(1, { message: 'La descrizione è obbligatoria' }),
  documentRef: z.string().optional(),
  documentType: z.string().optional(),
  accountId: z.string().optional(),
  // Centro di costo esplicito: se assente, lo risolve la route dalla regola
  // del conto (cost-center-service). Mai obbligatorio nello schema: il centro
  // di default copre i conti che non lo richiedono.
  costCenterId: z.string().optional().nullable(),
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
  costCenterId: z.string().optional().nullable(),
  vatAmount: z.number().min(0).optional(),
})

// Schema filtri lista
export const journalEntryFiltersSchema = z.object({
  registerType: registerTypeSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  entryType: entryTypeSchema.optional(),
  accountId: z.string().optional(),
  costCenterId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

// Tipi inferiti
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>
export type JournalEntryFiltersInput = z.infer<typeof journalEntryFiltersSchema>
