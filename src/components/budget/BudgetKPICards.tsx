'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/constants'
import {
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
} from 'lucide-react'

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

interface BudgetKPIs {
  targetRevenue: MonthlyWithAnnual
  totalRevenue: MonthlyWithAnnual
  totalCosts: MonthlyWithAnnual
  profit: MonthlyWithAnnual
  profitMargin: MonthlyWithAnnual
  liquidity: number
}

interface BudgetKPICardsProps {
  kpis: BudgetKPIs
  selectedMonth: string | null // null = annual view
}

const MONTH_KEY_MAP: Record<string, keyof MonthlyWithAnnual> = {
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

function getPercentChange(target: number, actual: number): number {
  if (target === 0) return actual > 0 ? 100 : 0
  return ((actual - target) / Math.abs(target)) * 100
}

export function BudgetKPICards({ kpis, selectedMonth }: BudgetKPICardsProps) {
  const targetValue = getMonthValue(kpis.targetRevenue, selectedMonth)
  const revenueValue = getMonthValue(kpis.totalRevenue, selectedMonth)
  const costsValue = getMonthValue(kpis.totalCosts, selectedMonth)
  const profitValue = getMonthValue(kpis.profit, selectedMonth)
  const marginValue = getMonthValue(kpis.profitMargin, selectedMonth)

  const revenueVsTarget = getPercentChange(targetValue, revenueValue)
  const costsPercent = revenueValue > 0 ? (costsValue / revenueValue) * 100 : 0
  const profitPercent = revenueValue > 0 ? (profitValue / revenueValue) * 100 : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {/* Target */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3" />
            TARGET
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xl font-bold">
            {formatCurrency(targetValue)}
          </div>
          {targetValue > 0 && (
            <p
              className={`text-xs ${revenueVsTarget >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {revenueVsTarget >= 0 ? '+' : ''}
              {revenueVsTarget.toFixed(1)}% vs actual
            </p>
          )}
        </CardContent>
      </Card>

      {/* Ricavi */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            RICAVI
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xl font-bold text-green-600">
            {formatCurrency(revenueValue)}
          </div>
          <p className="text-xs text-muted-foreground">
            {targetValue > 0
              ? `${((revenueValue / targetValue) * 100).toFixed(0)}% del target`
              : '100%'}
          </p>
        </CardContent>
      </Card>

      {/* Costi */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" />
            COSTI
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xl font-bold text-red-600">
            {formatCurrency(costsValue)}
          </div>
          <p className="text-xs text-muted-foreground">
            {costsPercent.toFixed(1)}% dei ricavi
          </p>
        </CardContent>
      </Card>

      {/* Utile */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            UTILE
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div
            className={`text-xl font-bold ${profitValue >= 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            {formatCurrency(profitValue)}
          </div>
          <p className="text-xs text-muted-foreground">
            {profitPercent.toFixed(1)}% margine
          </p>
        </CardContent>
      </Card>

      {/* Liquidita */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            LIQUIDITA
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div
            className={`text-xl font-bold ${kpis.liquidity >= 0 ? 'text-blue-600' : 'text-red-600'}`}
          >
            {formatCurrency(kpis.liquidity)}
          </div>
          <p className="text-xs text-muted-foreground">Cassa + Banca</p>
        </CardContent>
      </Card>
    </div>
  )
}
