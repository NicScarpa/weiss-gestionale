// Tipi per Prima Nota (Registri Contabili)

// Tipo registro
export type RegisterType = 'CASH' | 'BANK'

// Etichette registri
export const REGISTER_LABELS: Record<RegisterType, string> = {
  CASH: 'Cassa',
  BANK: 'Banca',
}

// Tipo movimento
export type EntryType =
  | 'INCASSO'     // Entrata generica
  | 'USCITA'      // Uscita generica
  | 'VERSAMENTO'  // Da cassa a banca
  | 'PRELIEVO'    // Da banca a cassa
  | 'GIROCONTO'   // Tra conti

// Etichette tipi movimento
export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  INCASSO: 'Incasso',
  USCITA: 'Uscita',
  VERSAMENTO: 'Versamento',
  PRELIEVO: 'Prelievo',
  GIROCONTO: 'Giroconto',
}

// Colori per tipo movimento
export const ENTRY_TYPE_COLORS: Record<EntryType, string> = {
  INCASSO: 'text-green-600',
  USCITA: 'text-red-600',
  VERSAMENTO: 'text-blue-600',
  PRELIEVO: 'text-amber-600',
  GIROCONTO: 'text-purple-600',
}

// Movimento prima nota
export interface JournalEntry {
  id: string
  venueId: string
  date: Date
  registerType: RegisterType
  documentRef?: string
  documentType?: string
  description: string
  debitAmount?: number   // Dare
  creditAmount?: number  // Avere
  vatAmount?: number
  accountId?: string
  counterpartId?: string
  closureId?: string
  runningBalance?: number
  createdById?: string
  createdAt: Date
  updatedAt: Date
  // === Estensioni Sibill ===
  verified?: boolean
  hiddenAt?: Date
  categorizationSource?: 'manual' | 'automatic' | 'rule' | 'import'
  counterpartName?: string
  notes?: string
  budgetCategoryId?: string
  appliedRuleId?: string
  // Relations (populated)
  venue?: {
    id: string
    name: string
    code: string
  }
  account?: {
    id: string
    code: string
    name: string
  }
  counterpart?: {
    id: string
    code: string
    name: string
  }
  budgetCategory?: {
    id: string
    code: string
    name: string
    color?: string
  }
  appliedRule?: {
    id: string
    name: string
    keywords: string[]
  }
  closure?: {
    id: string
    date: Date
  }
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  }
}

// Saldo registro
export interface RegisterBalance {
  id: string
  venueId: string
  registerType: RegisterType
  date: Date
  openingBalance: number
  totalDebits: number
  totalCredits: number
  closingBalance: number
}

// Riepilogo saldi
export interface BalanceSummary {
  cash: {
    balance: number
    lastUpdated: Date | null
  }
  bank: {
    balance: number
    lastUpdated: Date | null
  }
  total: number
}

// Form data per nuovo movimento
export interface JournalEntryFormData {
  date: Date
  registerType: RegisterType
  entryType: EntryType
  amount: number
  description: string
  documentRef?: string
  documentType?: string
  accountId?: string
  vatAmount?: number
  notes?: string
}

// Filtri lista movimenti
export interface JournalEntryFilters {
  registerType?: RegisterType
  dateFrom?: Date
  dateTo?: Date
  entryType?: EntryType
  accountId?: string
  budgetCategoryId?: string  // Sibill: filtra per categoria budget
  verified?: boolean           // Sibill: filtra per stato verifica
  categorizationSource?: 'manual' | 'automatic' | 'rule' | 'import'  // Sibill: origine categorizzazione
  search?: string
}

// Risposta paginata
export interface JournalEntryListResponse {
  data: JournalEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  summary: {
    totalDebits: number
    totalCredits: number
    netMovement: number
  }
}

// Operazione versamento cassa-banca
export interface BankDepositData {
  date: Date
  amount: number
  description?: string
  documentRef?: string
}
