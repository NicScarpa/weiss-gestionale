// Tipi per la riconciliazione bancaria

export type ImportSource = 'CSV' | 'XLSX' | 'CBI_XML' | 'CBI_TXT' | 'PSD2_FABRICK' | 'PSD2_TINK' | 'MANUAL'

export type ReconciliationStatus =
  | 'PENDING'
  | 'MATCHED'
  | 'TO_REVIEW'
  | 'MANUAL'
  | 'IGNORED'
  | 'UNMATCHED'

export interface BankTransaction {
  id: string
  venueId: string
  transactionDate: Date
  valueDate: Date | null
  description: string
  amount: number // + entrata, - uscita
  balanceAfter: number | null
  bankReference: string | null
  importBatchId: string | null
  importedAt: Date
  importSource: ImportSource
  status: ReconciliationStatus
  matchedEntryId: string | null
  matchConfidence: number | null // 0.00-1.00
  reconciledBy: string | null
  reconciledAt: Date | null
  createdAt: Date
}

export interface ImportBatch {
  id: string
  venueId: string
  filename: string | null
  source: ImportSource
  recordCount: number
  duplicatesSkipped: number
  errorsCount: number
  importedBy: string
  importedAt: Date
}

export interface BankTransactionWithMatch extends BankTransaction {
  matchedEntry?: {
    id: string
    date: Date
    description: string
    debitAmount: number | null
    creditAmount: number | null
    documentRef: string | null
  } | null
  venue?: {
    id: string
    name: string
    code: string
  }
}

export interface ReconciliationSummary {
  totalTransactions: number
  matched: number
  toReview: number
  unmatched: number
  ignored: number
  pending: number
  bankBalance: number // Saldo da estratto conto
  ledgerBalance: number // Saldo da prima nota
  difference: number // Differenza
}

export interface ImportResult {
  batchId: string
  recordsImported: number
  duplicatesSkipped: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  field: string
  message: string
  value?: string
}

export interface MatchCandidate {
  journalEntryId: string
  date: Date
  description: string
  amount: number
  documentRef: string | null
  confidence: number
}

export interface ReconcileResult {
  matched: number
  toReview: number
  unmatched: number
  transactions: Array<{
    id: string
    status: ReconciliationStatus
    matchedEntryId: string | null
    matchConfidence: number | null
  }>
}

// Formato CSV per import
export interface CSVRow {
  transactionDate: string // DD/MM/YYYY
  valueDate?: string // DD/MM/YYYY
  description: string
  amount: string // Formato italiano: -1.234,56
  balance?: string // Saldo dopo operazione
  reference?: string // Riferimento banca
}

// Configurazione parser CSV
export interface CSVParserConfig {
  delimiter: string // Default: ';'
  dateFormat: string // Default: 'DD/MM/YYYY'
  decimalSeparator: string // Default: ','
  thousandSeparator: string // Default: '.'
  hasHeader: boolean // Default: true
  columnMapping: {
    transactionDate: string | number
    valueDate?: string | number
    description: string | number
    amount: string | number
    balance?: string | number
    reference?: string | number
  }
}

// Soglie di matching
export const MATCH_THRESHOLDS = {
  AUTO_MATCH: 0.9, // >= 90% -> auto-match
  REVIEW: 0.7, // 70-89% -> richiede review
  NO_MATCH: 0.7, // < 70% -> nessun match
} as const

// Pesi per il calcolo del confidence score
export const MATCH_WEIGHTS = {
  AMOUNT: 0.4, // 40% peso importo
  DATE: 0.3, // 30% peso data
  DESCRIPTION: 0.3, // 30% peso descrizione
} as const
