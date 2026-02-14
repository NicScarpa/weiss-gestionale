// Tipi per Sibill Categorization Rules

export enum RuleDirection {
  INFLOW = 'INFLOW',
  OUTFLOW = 'OUTFLOW',
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
}

export interface RuleCondition {
  field: 'description' | 'counterpart' | 'amount'
  operator: 'contains' | 'equals' | 'greaterThan' | 'lessThan'
  value: string | number
}

export const RULE_DIRECTION_LABELS: Record<RuleDirection, string> = {
  [RuleDirection.INFLOW]: 'In entrata',
  [RuleDirection.OUTFLOW]: 'In uscita',
} as const
