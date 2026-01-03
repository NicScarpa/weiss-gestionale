// Tipi per il modulo Budget

// Stato del budget
export type BudgetStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

// Etichette stato budget
export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  DRAFT: 'Bozza',
  ACTIVE: 'Attivo',
  ARCHIVED: 'Archiviato',
}

// Colori stato budget
export const BUDGET_STATUS_COLORS: Record<BudgetStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-amber-100 text-amber-700',
}

// Tipo alert budget
export type BudgetAlertType = 'OVER_BUDGET' | 'UNDER_REVENUE'

// Etichette tipo alert
export const BUDGET_ALERT_TYPE_LABELS: Record<BudgetAlertType, string> = {
  OVER_BUDGET: 'Superamento Budget',
  UNDER_REVENUE: 'Ricavi Insufficienti',
}

// Stato alert
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'

// Etichette stato alert
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  ACTIVE: 'Attivo',
  ACKNOWLEDGED: 'Preso visione',
  RESOLVED: 'Risolto',
}

// Nomi mesi (abbreviati)
export const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const
export type MonthKey = typeof MONTH_KEYS[number]

// Nomi mesi italiani
export const MONTH_LABELS: Record<MonthKey, string> = {
  jan: 'Gen',
  feb: 'Feb',
  mar: 'Mar',
  apr: 'Apr',
  may: 'Mag',
  jun: 'Giu',
  jul: 'Lug',
  aug: 'Ago',
  sep: 'Set',
  oct: 'Ott',
  nov: 'Nov',
  dec: 'Dic',
}

// Nomi mesi italiani completi
export const MONTH_LABELS_FULL: Record<MonthKey, string> = {
  jan: 'Gennaio',
  feb: 'Febbraio',
  mar: 'Marzo',
  apr: 'Aprile',
  may: 'Maggio',
  jun: 'Giugno',
  jul: 'Luglio',
  aug: 'Agosto',
  sep: 'Settembre',
  oct: 'Ottobre',
  nov: 'Novembre',
  dec: 'Dicembre',
}

// Mapping mese numero -> key
export const MONTH_NUMBER_TO_KEY: Record<number, MonthKey> = {
  1: 'jan',
  2: 'feb',
  3: 'mar',
  4: 'apr',
  5: 'may',
  6: 'jun',
  7: 'jul',
  8: 'aug',
  9: 'sep',
  10: 'oct',
  11: 'nov',
  12: 'dec',
}

// Valori mensili
export type MonthlyValues = Record<MonthKey, number>

// Budget
export interface Budget {
  id: string
  venueId: string
  year: number
  name?: string
  status: BudgetStatus
  notes?: string
  createdById?: string
  createdAt: Date
  updatedAt: Date
  // Relations
  venue?: {
    id: string
    name: string
    code: string
  }
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  }
  lines?: BudgetLine[]
  alerts?: BudgetAlert[]
  // Computed
  totalBudget?: number
  lineCount?: number
}

// Riga budget
export interface BudgetLine {
  id: string
  budgetId: string
  accountId: string
  jan: number
  feb: number
  mar: number
  apr: number
  may: number
  jun: number
  jul: number
  aug: number
  sep: number
  oct: number
  nov: number
  dec: number
  annualTotal: number
  notes?: string
  createdAt: Date
  updatedAt: Date
  // Relations
  account?: {
    id: string
    code: string
    name: string
    type: string
  }
}

// Alert budget
export interface BudgetAlert {
  id: string
  budgetId: string
  accountId?: string
  month?: number
  alertType: BudgetAlertType
  budgetAmount: number
  actualAmount: number
  varianceAmount: number
  variancePercent: number
  status: AlertStatus
  acknowledgedBy?: string
  acknowledgedAt?: Date
  message?: string
  createdAt: Date
  // Relations
  budget?: Budget
}

// Form data per nuovo budget
export interface BudgetFormData {
  venueId: string
  year: number
  name?: string
  notes?: string
  copyFromYear?: number // Opzione per copiare da anno precedente
}

// Form data per riga budget
export interface BudgetLineFormData {
  accountId: string
  jan: number
  feb: number
  mar: number
  apr: number
  may: number
  jun: number
  jul: number
  aug: number
  sep: number
  oct: number
  nov: number
  dec: number
  notes?: string
}

// Confronto budget vs actual
export interface BudgetComparison {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  budget: MonthlyValues & { annual: number }
  actual: MonthlyValues & { annual: number }
  variance: MonthlyValues & { annual: number }
  variancePercent: MonthlyValues & { annual: number }
}

// Riepilogo confronto
export interface BudgetComparisonSummary {
  period: {
    year: number
    month?: number
  }
  totalBudget: number
  totalActual: number
  totalVariance: number
  totalVariancePercent: number
  byType: {
    RICAVO: {
      budget: number
      actual: number
      variance: number
      variancePercent: number
    }
    COSTO: {
      budget: number
      actual: number
      variance: number
      variancePercent: number
    }
  }
  alertsCount: {
    active: number
    acknowledged: number
    resolved: number
  }
}

// Filtri lista budget
export interface BudgetFilters {
  venueId?: string
  year?: number
  status?: BudgetStatus
}

// Risposta lista budget
export interface BudgetListResponse {
  data: Budget[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Costanti soglie
export const BUDGET_VARIANCE_THRESHOLD = 0.10 // 10%
export const BUDGET_WARNING_THRESHOLD = 0.05  // 5%
