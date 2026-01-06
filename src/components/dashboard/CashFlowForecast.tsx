'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Wallet,
  ArrowRight,
  Calendar,
  DollarSign,
} from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

interface ForecastDay {
  date: string
  dateFormatted: string
  dayOfWeek: string
  expectedIncome: number
  expectedExpenses: number
  netChange: number
  projectedBalance: number
  isWeekend: boolean
  incomeSource: 'historical' | 'average' | 'hybrid'
  expenses: Array<{ name: string; amount: number }>
}

interface ForecastData {
  currentBalance: {
    cash: number
    bank: number
    total: number
  }
  forecast: ForecastDay[]
  summary: {
    totalExpectedIncome: number
    totalExpectedExpenses: number
    minBalance: number
    minBalanceDate: string
    maxBalance: number
    maxBalanceDate: string
    daysUntilLowBalance: number | null
    averageDailyIncome: number
  }
  alerts: Array<{
    type: 'LOW_BALANCE' | 'NEGATIVE_BALANCE' | 'HIGH_EXPENSE_DAY'
    date: string
    message: string
    severity: 'warning' | 'critical'
  }>
  settings: {
    lowBalanceThreshold: number
    forecastDays: number
    forecastMethod: string
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }
  return formatCurrency(value)
}

export function CashFlowForecast() {
  const [forecastDays, setForecastDays] = useState('30')

  const { data, isLoading, error } = useQuery<ForecastData>({
    queryKey: ['cashflow-forecast', forecastDays],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/forecast?days=${forecastDays}`)
      if (!res.ok) throw new Error('Errore nel caricamento previsione')
      return res.json()
    },
    refetchInterval: 300000, // Refresh ogni 5 minuti
  })

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Previsione Cash Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Impossibile caricare la previsione
          </p>
        </CardContent>
      </Card>
    )
  }

  const hasAlerts = data?.alerts && data.alerts.length > 0
  const hasCriticalAlerts = data?.alerts?.some((a) => a.severity === 'critical')

  return (
    <Card className={hasCriticalAlerts ? 'border-red-200' : hasAlerts ? 'border-amber-200' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Previsione Cash Flow
            </CardTitle>
            <CardDescription>
              Proiezione liquidita prossimi {forecastDays} giorni
            </CardDescription>
          </div>
          <Select value={forecastDays} onValueChange={setForecastDays}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 giorni</SelectItem>
              <SelectItem value="14">14 giorni</SelectItem>
              <SelectItem value="30">30 giorni</SelectItem>
              <SelectItem value="60">60 giorni</SelectItem>
              <SelectItem value="90">90 giorni</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="h-24" />
          </div>
        ) : (
          <>
            {/* Current Balance */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Cassa</div>
                <div className="text-lg font-semibold">
                  {formatCompactCurrency(data?.currentBalance.cash || 0)}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Banca</div>
                <div className="text-lg font-semibold">
                  {formatCompactCurrency(data?.currentBalance.bank || 0)}
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-blue-600 mb-1 flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  Totale
                </div>
                <div className="text-lg font-bold text-blue-700">
                  {formatCompactCurrency(data?.currentBalance.total || 0)}
                </div>
              </div>
            </div>

            {/* Alerts */}
            {hasAlerts && (
              <div className={`rounded-lg p-3 space-y-2 ${hasCriticalAlerts ? 'bg-red-50' : 'bg-amber-50'}`}>
                {data?.alerts.slice(0, 3).map((alert, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 text-sm ${
                      alert.severity === 'critical' ? 'text-red-700' : 'text-amber-700'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{alert.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  Saldo Minimo Previsto
                </div>
                <div
                  className={`text-lg font-semibold ${
                    (data?.summary.minBalance || 0) < (data?.settings.lowBalanceThreshold || 5000)
                      ? 'text-red-600'
                      : ''
                  }`}
                >
                  {formatCurrency(data?.summary.minBalance || 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data?.summary.minBalanceDate &&
                    new Date(data.summary.minBalanceDate).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                    })}
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Media Giornaliera
                </div>
                <div className="text-lg font-semibold">
                  {formatCurrency(data?.summary.averageDailyIncome || 0)}
                </div>
                <div className="text-xs text-muted-foreground">entrate previste</div>
              </div>
            </div>

            {/* Mini Chart - Simple visual representation */}
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Andamento previsto
              </div>
              <div className="flex items-end gap-1 h-16">
                {data?.forecast.slice(0, 14).map((day, idx) => {
                  const maxBalance = Math.max(
                    ...data.forecast.slice(0, 14).map((d) => d.projectedBalance)
                  )
                  const minBalance = Math.min(
                    ...data.forecast.slice(0, 14).map((d) => d.projectedBalance)
                  )
                  const range = maxBalance - minBalance || 1
                  const height = ((day.projectedBalance - minBalance) / range) * 100
                  const isLow = day.projectedBalance < (data.settings.lowBalanceThreshold || 5000)
                  const isNegative = day.projectedBalance < 0

                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-t transition-all ${
                        isNegative
                          ? 'bg-red-400'
                          : isLow
                          ? 'bg-amber-400'
                          : 'bg-blue-400'
                      } ${day.isWeekend ? 'opacity-50' : ''}`}
                      style={{ height: `${Math.max(height, 10)}%` }}
                      title={`${day.dateFormatted}: ${formatCurrency(day.projectedBalance)}`}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Oggi</span>
                <span>+14 giorni</span>
              </div>
            </div>

            {/* Upcoming Expenses Preview */}
            {data?.forecast.some((d) => d.expenses.length > 0) && (
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-2">
                  Prossime uscite programmate
                </div>
                <div className="space-y-1">
                  {data?.forecast
                    .filter((d) => d.expenses.length > 0)
                    .slice(0, 3)
                    .map((day, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {day.dateFormatted}
                          </Badge>
                          <span className="text-muted-foreground">
                            {day.expenses.map((e) => e.name).join(', ')}
                          </span>
                        </div>
                        <span className="font-medium text-red-600">
                          -{formatCurrency(day.expectedExpenses)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Action Button */}
            <Button variant="ghost" className="w-full" asChild>
              <Link href="/impostazioni?tab=cashflow">
                Gestisci spese ricorrenti
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
