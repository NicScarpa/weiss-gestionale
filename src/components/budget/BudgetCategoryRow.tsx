'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, AlertTriangle, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface MonthlyWithAnnual {
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
  annual: number
}

type MonthKey = 'jan' | 'feb' | 'mar' | 'apr' | 'may' | 'jun' | 'jul' | 'aug' | 'sep' | 'oct' | 'nov' | 'dec'

interface CategoryData {
  id: string
  code: string
  name: string
  categoryType: 'REVENUE' | 'COST' | 'KPI' | 'TAX' | 'INVESTMENT' | 'VAT'
  benchmarkPercentage: number | null
  alertThresholdPercent: number
  color: string | null
  icon: string | null
  level: number
  parentId: string | null
  displayOrder: number
  budget: MonthlyWithAnnual
  actual: MonthlyWithAnnual
  variance: MonthlyWithAnnual
  percentOfRevenue: MonthlyWithAnnual
  status: 'ok' | 'warning' | 'alert'
  children: CategoryData[]
}

interface BudgetCategoryRowProps {
  category: CategoryData
  selectedMonth: string | null // null = annual view
  depth?: number
  showBudget?: boolean
  showVariance?: boolean
}

const MONTH_KEY_MAP: Record<string, MonthKey> = {
  '1': 'jan',
  '2': 'feb',
  '3': 'mar',
  '4': 'apr',
  '5': 'may',
  '6': 'jun',
  '7': 'jul',
  '8': 'aug',
  '9': 'sep',
  '10': 'oct',
  '11': 'nov',
  '12': 'dec',
}

function getMonthValue(values: MonthlyWithAnnual, month: string | null): number {
  if (!month) return values.annual
  const key = MONTH_KEY_MAP[month]
  return key ? values[key] : values.annual
}

function StatusIcon({ status }: { status: 'ok' | 'warning' | 'alert' }) {
  if (status === 'alert') {
    return <AlertCircle className="h-4 w-4 text-red-500" />
  }
  if (status === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-amber-500" />
  }
  return <Check className="h-4 w-4 text-green-500" />
}

export function BudgetCategoryRow({
  category,
  selectedMonth,
  depth = 0,
  showBudget = true,
  showVariance = true,
}: BudgetCategoryRowProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0)
  const hasChildren = category.children && category.children.length > 0

  const budgetValue = getMonthValue(category.budget, selectedMonth)
  const actualValue = getMonthValue(category.actual, selectedMonth)
  const varianceValue = getMonthValue(category.variance, selectedMonth)
  const percentValue = getMonthValue(category.percentOfRevenue, selectedMonth)

  const isRoot = depth === 0

  return (
    <>
      <tr
        className={cn(
          'border-b transition-colors hover:bg-muted/50',
          isRoot && 'bg-muted/30 font-medium',
          depth > 0 && 'text-sm'
        )}
      >
        {/* Categoria */}
        <td className="p-2 sticky left-0 bg-background z-10">
          <div
            className="flex items-center gap-1"
            style={{ paddingLeft: `${depth * 16}px` }}
          >
            {hasChildren ? (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-0.5 hover:bg-muted rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}
            {category.color && (
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
            )}
            <span className={cn(isRoot && 'font-semibold')}>{category.name}</span>
          </div>
        </td>

        {/* Budget */}
        {showBudget && (
          <td className="p-2 text-right tabular-nums">
            {budgetValue > 0 ? formatCurrency(budgetValue) : '-'}
          </td>
        )}

        {/* Actual */}
        <td className="p-2 text-right tabular-nums font-medium">
          {actualValue > 0 ? formatCurrency(actualValue) : '-'}
        </td>

        {/* Varianza */}
        {showVariance && (
          <td
            className={cn(
              'p-2 text-right tabular-nums',
              varianceValue > 0 && category.categoryType === 'REVENUE' && 'text-green-600',
              varianceValue < 0 && category.categoryType === 'REVENUE' && 'text-red-600',
              varianceValue < 0 && category.categoryType !== 'REVENUE' && 'text-green-600',
              varianceValue > 0 && category.categoryType !== 'REVENUE' && 'text-red-600'
            )}
          >
            {varianceValue !== 0 ? (
              <>
                {varianceValue > 0 ? '+' : ''}
                {formatCurrency(varianceValue)}
              </>
            ) : (
              '-'
            )}
          </td>
        )}

        {/* % Ricavi */}
        <td className="p-2 text-right tabular-nums">
          {actualValue > 0 ? `${percentValue.toFixed(1)}%` : '-'}
        </td>

        {/* Benchmark */}
        <td className="p-2 text-right tabular-nums text-muted-foreground">
          {category.benchmarkPercentage !== null
            ? `${category.benchmarkPercentage}%`
            : '-'}
        </td>

        {/* Status */}
        <td className="p-2 text-center">
          {category.benchmarkPercentage !== null && actualValue > 0 ? (
            <StatusIcon status={category.status} />
          ) : null}
        </td>
      </tr>

      {/* Children */}
      {isExpanded &&
        hasChildren &&
        category.children.map((child) => (
          <BudgetCategoryRow
            key={child.id}
            category={child}
            selectedMonth={selectedMonth}
            depth={depth + 1}
            showBudget={showBudget}
            showVariance={showVariance}
          />
        ))}
    </>
  )
}
