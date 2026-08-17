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

// Modifica di una riga: `strict()` perché la forma della rotta È il divieto —
// data, importo e verso della banca non sono campi che si possono mandare.
export const patchBankTransactionSchema = z
  .object({
    descrizione: z.string().max(500).nullable().optional(),
    causale: z.string().max(120).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    // Solo sulle righe MANUAL; sulle altre la rotta risponde 400 se compaiono.
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    amount: z.number().refine((n) => n !== 0, "L'importo non può essere zero").optional(),
  })
  .strict()
export const CAMPI_SOLO_MANUALI = ['transactionDate', 'valueDate', 'amount'] as const

// Le azioni contabili della consegna B (spec, «Le azioni»). L'imputazione è
// conto + centro: la categoria di budget si deriva dal conto e non si chiede.
export const imputazioneSchema = z.object({
  accountId: z.string().min(1),
  costCenterId: z.string().min(1).optional(),
})
export const categorizzaSchema = imputazioneSchema.strict()

// Collega: le scadenze con la quota di ciascuna, OPPURE una scrittura esistente
// (la R4). Mai entrambe: la R4 si lega, non aggiunge documenti.
export const collegaSchema = z
  .object({
    scadenze: z
      .array(z.object({ scheduleId: z.string().min(1), amount: z.number().positive() }))
      .min(1)
      .max(50)
      .optional(),
    scritturaEsistenteId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => !!v.scadenze !== !!v.scritturaEsistenteId, {
    message: 'Indica le scadenze oppure la scrittura esistente, non entrambe',
  })

// Categorizza in blocco: per elenco di id o per filtro, come le altre azioni in blocco.
export const categorizzaInBloccoSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(1000).optional(),
    filtro: z.record(z.string(), z.string()).optional(),
    imputazione: imputazioneSchema,
  })
  .refine((v) => !!v.ids !== !!v.filtro, { message: 'Indica ids oppure filtro, non entrambi' })

// Sposta in: la scheda in cui la riga si vede (spec, decisione 5).
export const sezioneMovimentoSchema = z.enum(['ATTIVI', 'DELEGHE_F24', 'CBILL_PAGOPA'])
export const spostaSezioneSchema = z.object({ sezione: sezioneMovimentoSchema })

// Le azioni in blocco viaggiano per elenco di id **o** per filtro (le stesse
// chiavi dell'URL della lista): «seleziona tutte le 231 del filtro» non deve
// dipendere da cosa il client credeva di aver selezionato.
export const azioniInBloccoSchema = z
  .object({
    azione: z.enum(['sposta', 'cestino', 'ripristina']),
    sezione: sezioneMovimentoSchema.optional(),
    ids: z.array(z.string().min(1)).min(1).max(1000).optional(),
    filtro: z.record(z.string(), z.string()).optional(),
  })
  .refine((v) => !!v.ids !== !!v.filtro, { message: 'Indica ids oppure filtro, non entrambi' })
  .refine((v) => v.azione !== 'sposta' || !!v.sezione, { message: 'Per spostare serve la sezione' })

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
export type CreateEntryFromTransaction = z.infer<typeof createEntryFromTransactionSchema>
export type ReconcileParams = z.infer<typeof reconcileSchema>
export type CSVParserConfig = z.infer<typeof csvParserConfigSchema>
export type ImportBatchParams = z.infer<typeof importBatchSchema>
export type SummaryQuery = z.infer<typeof summaryQuerySchema>
