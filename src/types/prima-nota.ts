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
  | 'GIROCONTO'   // Fra due registri, direzione da indicare

/**
 * I movimenti che spostano denaro fra i registri invece di farlo entrare o
 * uscire dall'azienda: valgono due scritture, e il totale non cambia.
 *
 * Stanno qui e non in `@/lib/prima-nota-utils` perché servono anche al modulo
 * di inserimento, che gira nel browser: quel file trascina l'aritmetica del
 * denaro e il client Prisma, che nel bundle della pagina non hanno niente da
 * fare. La regola resta comunque in un posto solo.
 */
export const TIPI_TRASFERIMENTO = ['VERSAMENTO', 'PRELIEVO', 'GIROCONTO'] as const

export type TipoTrasferimento = (typeof TIPI_TRASFERIMENTO)[number]

export function isTrasferimento(entryType: EntryType): entryType is TipoTrasferimento {
  return (TIPI_TRASFERIMENTO as readonly EntryType[]).includes(entryType)
}

export interface RegistriDelTrasferimento {
  /** Registro da cui il denaro esce: ci va l'AVERE. */
  da: RegisterType
  /** Registro in cui il denaro entra: ci va il DARE. */
  a: RegisterType
}

/**
 * Versamento e prelievo hanno la direzione scritta nel nome: sono l'unica cosa
 * che possono essere, e non c'è niente da chiedere a chi li registra. Il
 * giroconto non è qui proprio perché la direzione gliela deve dare l'utente.
 */
export const REGISTRI_IMPLICITI: Record<'VERSAMENTO' | 'PRELIEVO', RegistriDelTrasferimento> = {
  VERSAMENTO: { da: 'CASH', a: 'BANK' },
  PRELIEVO: { da: 'BANK', a: 'CASH' },
}

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
  entryType: EntryType
  documentRef?: string
  documentType?: string
  description: string
  debitAmount?: number   // Dare
  creditAmount?: number  // Avere
  vatAmount?: number
  accountId?: string
  costCenterId?: string | null
  counterpartId?: string
  closureId?: string
  runningBalance?: number
  createdById?: string
  createdAt: Date
  updatedAt: Date
  // === Estensioni Sibill ===
  verified?: boolean
  hiddenAt?: Date
  categorizationSource?: 'manual' | 'automatic' | 'rule' | 'import' | 'split'
  counterpartName?: string
  notes?: string
  budgetCategoryId?: string
  appliedRuleId?: string
  paymentId?: string
  // Fette di suddivisione manuale (Allocation, Fase 1)
  allocations?: JournalEntryAllocation[]
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
  costCenter?: {
    id: string
    code: string
    name: string
  } | null
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
  payment?: {
    id: string
    tipo: PaymentType
    stato: PaymentStatus
  }
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  }
}

// ==================== SUDDIVISIONE MOVIMENTO (Allocation) ====================

// Fetta di suddivisione di un movimento su più conti (Fase 1); 'manuale' è
// creata dall'editor SplitEntryDialog, 'ereditata' arriva pro-quota dalla
// riconciliazione con le scadenze di fattura (Fase 3) ed è di sola lettura.
export interface JournalEntryAllocation {
  id: string
  accountId: string
  importo: number
  origine: 'manuale' | 'ereditata'
  note?: string
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
  costCenterId?: string
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
  costCenterId?: string
  budgetCategoryId?: string  // Sibill: filtra per categoria budget
  verified?: boolean           // Sibill: filtra per stato verifica
  categorizationSource?: 'manual' | 'automatic' | 'rule' | 'import' | 'split'  // Sibill: origine categorizzazione
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

// ==================== TIPI PAGAMENTO (Sibill) ====================

// Stati pagamento (da schema.prisma PaymentStatus)
export type PaymentStatus = 'BOZZA' | 'DA_APPROVARE' | 'DISPOSTO' | 'COMPLETATO' | 'FALLITO' | 'ANNULLATO'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  BOZZA: 'Bozza',
  DA_APPROVARE: 'Da Approvare',
  DISPOSTO: 'Disposto',
  COMPLETATO: 'Completato',
  FALLITO: 'Fallito',
  ANNULLATO: 'Annullato',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  BOZZA: 'bg-gray-100 text-gray-700 border-gray-300',
  DA_APPROVARE: 'bg-blue-100 text-blue-700 border-blue-300',
  DISPOSTO: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  COMPLETATO: 'bg-green-100 text-green-700 border-green-300',
  FALLITO: 'bg-red-100 text-red-700 border-red-300',
  ANNULLATO: 'bg-slate-100 text-slate-500 border-slate-300',
}

export const PAYMENT_STATUS_ICONS: Record<PaymentStatus, string> = {
  BOZZA: '📝',
  DA_APPROVARE: '👀',
  DISPOSTO: '📤',
  COMPLETATO: '✅',
  FALLITO: '❌',
  ANNULLATO: '🚫',
}

// Tipi pagamento (da schema.prisma PaymentType)
export type PaymentType = 'BONIFICO' | 'F24' | 'ALTRO'

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  BONIFICO: 'Bonifico',
  F24: 'F24',
  ALTRO: 'Altro',
}

export const PAYMENT_TYPE_ICONS: Record<PaymentType, string> = {
  BONIFICO: '🏦',
  F24: '📄',
  ALTRO: '📎',
}

// Interfaccia Payment (estensioni da JournalEntry)
export interface Payment {
  id: string
  venueId: string
  tipo: PaymentType
  stato: PaymentStatus
  riferimentoInterno?: string
  dataEsecuzione: Date
  importo: number
  beneficiarioNome: string
  beneficiarioIban?: string
  causale?: string
  note?: string
  journalEntryId?: string
  createdById?: string
  createdAt: Date
  updatedAt: Date
  // Relazioni (popolate)
  venue?: { id: string; name: string; code: string }
  journalEntry?: JournalEntry
  createdBy?: { id: string; firstName: string; lastName: string }
}

// Form data per nuovo pagamento
export interface PaymentFormData {
  dataEsecuzione: Date
  tipo: PaymentType
  importo: number
  beneficiarioNome: string
  beneficiarioIban?: string
  causale?: string
  note?: string
  riferimentoInterno?: string
}

// Filtri pagamenti
export interface PaymentFilters {
  stato?: PaymentStatus
  dateFrom?: Date
  dateTo?: Date
  tipo?: PaymentType
  beneficiarioNome?: string
  search?: string
}

// Risposta paginata
export interface PaymentListResponse {
  data: Payment[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ==================== REGOLE CATEGORIZZAZIONE (Sibill) ====================

// Tipi regola categorizzazione
export type RuleDirection = 'INFLOW' | 'OUTFLOW'

export const RULE_DIRECTION_LABELS: Record<RuleDirection, string> = {
  INFLOW: 'Entrata',
  OUTFLOW: 'Uscita',
}

export const RULE_DIRECTION_ICONS: Record<RuleDirection, string> = {
  INFLOW: '⬇️',
  OUTFLOW: '⬇️',
}

// Interfaccia CategorizationRule
export interface CategorizationRule {
  id: string
  venueId: string
  name: string
  direction: RuleDirection
  keywords: string[]
  priority: number
  isActive: boolean
  budgetCategoryId?: string
  accountId?: string
  autoVerify: boolean
  autoHide: boolean
  createdAt: Date
  updatedAt: Date
  // Relazioni
  venue?: { id: string; name: string; code: string }
  budgetCategory?: { id: string; code: string; name: string; color?: string }
  account?: { id: string; code: string; name: string }
  journalEntries?: JournalEntry[]
}

// Form data per nuova regola
export interface CategorizationRuleFormData {
  name: string
  direction: RuleDirection
  keywords: string[]
  priority: number
  isActive?: boolean
  budgetCategoryId?: string
  accountId?: string
  autoVerify?: boolean
  autoHide?: boolean
}

// Filtri regole
export interface CategorizationRuleFilters {
  isActive?: boolean
  direction?: RuleDirection
  accountId?: string
  budgetCategoryId?: string
  search?: string
}

// Risposta test regola
export interface CategorizationRuleTestResponse {
  rule: CategorizationRule
  matchedEntries: JournalEntry[]
  matchCount: number
}

// ==================== BADGE STATO CATEGORIZZAZIONE ====================

export type CategorizationSource = 'manual' | 'automatic' | 'rule' | 'import' | 'split'

export const CATEGORIZATION_SOURCE_LABELS: Record<CategorizationSource, string> = {
  manual: 'Manuale',
  automatic: 'Automatica',
  rule: 'Regola',
  import: 'Import',
  split: 'Suddiviso',
}

export const CATEGORIZATION_SOURCE_ICONS: Record<CategorizationSource, string> = {
  manual: '✏️',
  automatic: '🤖',
  rule: '📋',
  import: '📥',
  split: '✂️',
}

export const CATEGORIZATION_SOURCE_COLORS: Record<CategorizationSource, string> = {
  manual: 'bg-gray-100 text-gray-700 border-gray-300',
  automatic: 'bg-blue-100 text-blue-700 border-blue-300',
  rule: 'bg-purple-100 text-purple-700 border-purple-300',
  import: 'bg-green-100 text-green-700 border-green-300',
  split: 'bg-amber-100 text-amber-700 border-amber-300',
}

// ==================== MOVIMENTO ROW ACTIONS ====================

export type MovimentoAction = 'edit' | 'delete' | 'verify' | 'hide' | 'unhide' | 'categorize'

export const MOVIMENTO_ACTION_LABELS: Record<MovimentoAction, string> = {
  edit: 'Modifica',
  delete: 'Cancella',
  verify: 'Verifica',
  hide: 'Nascondi',
  unhide: 'Mostra',
  categorize: 'Categorizza',
}

// ==================== PAGAMENTO ROW ACTIONS ====================

export type PagamentoAction = 'edit' | 'delete' | 'approve' | 'dispose' | 'complete' | 'fail' | 'annul'

export const PAGAMENTO_ACTION_LABELS: Record<PagamentoAction, string> = {
  edit: 'Modifica',
  delete: 'Cancella',
  approve: 'Approva',
  dispose: 'Disponi',
  complete: 'Completa',
  fail: 'Fallito',
  annul: 'Annulla',
}
