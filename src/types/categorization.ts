// Tipi per il modulo Regole di Categorizzazione (Sibill)

export type RuleDirection = 'INFLOW' | 'OUTFLOW'

export const RULE_DIRECTION_LABELS: Record<RuleDirection, string> = {
  INFLOW: 'Entrata',
  OUTFLOW: 'Uscita',
}

export const RULE_DIRECTION_COLORS: Record<RuleDirection, string> = {
  INFLOW: 'text-green-600',
  OUTFLOW: 'text-red-600',
}

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
  // Relations
  venue?: {
    id: string
    name: string
    code: string
  }
  budgetCategory?: {
    id: string
    code: string
    name: string
    color?: string
  }
  account?: {
    id: string
    code: string
    name: string
  }
}

export interface CategorizationRuleFormData {
  venueId: string
  name: string
  direction: RuleDirection
  keywords: string[]
  priority?: number
  isActive?: boolean
  budgetCategoryId?: string
  accountId?: string
  autoVerify?: boolean
  autoHide?: boolean
}

export interface RuleTestResult {
  rule: CategorizationRule
  matched: boolean
  confidence: number
  suggestedCategory?: string
  suggestedAccount?: string
}

export interface CategorizationSuggestion {
  journalEntryId: string
  description: string
  amount: number
  debitAmount?: number
  creditAmount?: number
  matchedRules: RuleTestResult[]
  suggestedCategoryId?: string
  suggestedAccountId?: string
}

// Statistiche regole
export interface RuleStats {
  totalRules: number
  activeRules: number
  inflowRules: number
  outflowRules: number
  avgMatchesPerEntry: number
  autoVerificationRate: number
}
