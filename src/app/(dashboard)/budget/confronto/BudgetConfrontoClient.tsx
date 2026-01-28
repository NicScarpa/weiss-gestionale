'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  List,
  FolderTree,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'
import {
  type MonthKey,
} from '@/types/budget'
import {
  formatVariancePercent,
  getVarianceColor,
} from '@/lib/budget-utils'
import { BudgetCategoryRow } from '@/components/budget/BudgetCategoryRow'

import { logger } from '@/lib/logger'
interface Venue {
  id: string
  name: string
  code: string
}

interface Comparison {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  budget: Record<MonthKey, number> & { annual: number }
  actual: Record<MonthKey, number> & { annual: number }
  variance: Record<MonthKey, number> & { annual: number }
  variancePercent: Record<MonthKey, number> & { annual: number }
}

interface Summary {
  period: { year: number; month?: number }
  totalBudget: number
  totalActual: number
  totalVariance: number
  totalVariancePercent: number
  byType: {
    RICAVO: { budget: number; actual: number; variance: number; variancePercent: number }
    COSTO: { budget: number; actual: number; variance: number; variancePercent: number }
  }
  budgetId: string
  budgetStatus: string
  alertsCount: { active: number; acknowledged: number; resolved: number }
}

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

interface CategoryAggregation {
  budgetId: string
  year: number
  venue: { id: string; name: string; code: string }
  categories: CategoryData[]
}

interface BudgetConfrontoClientProps {
  venues: Venue[]
  availableYears: number[]
  defaultVenueId?: string
  isAdmin: boolean
}

export function BudgetConfrontoClient({
  venues,
  availableYears,
  defaultVenueId,
  isAdmin,
}: BudgetConfrontoClientProps) {
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [categoryData, setCategoryData] = useState<CategoryAggregation | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'categories' | 'accounts'>('categories')

  const [filters, setFilters] = useState({
    venueId: defaultVenueId || venues[0]?.id || '',
    year: availableYears[0] || new Date().getFullYear(),
    accountType: 'ALL' as 'ALL' | 'RICAVO' | 'COSTO',
  })

  // Fetch comparison data
  const fetchComparison = useCallback(async () => {
    if (!filters.venueId || !filters.year) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        venueId: filters.venueId,
        year: filters.year.toString(),
        accountType: filters.accountType,
      })

      const res = await fetch(`/api/budget/confronto?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nel caricamento')
      }

      const data = await res.json()
      setComparisons(data.comparisons)
      setSummary(data.summary)

      // Se abbiamo un budgetId, carichiamo anche le categorie
      if (data.summary?.budgetId) {
        try {
          const catRes = await fetch(`/api/budget/${data.summary.budgetId}/categories`)
          if (catRes.ok) {
            const catData = await catRes.json()
            setCategoryData(catData)
          }
        } catch {
          logger.warn('Impossibile caricare categorie budget')
        }
      }
    } catch (error: unknown) {
      logger.error('Errore fetch confronto', error)
      if (error instanceof Error) {
        toast.error(error.message)
      }
      setComparisons([])
      setSummary(null)
      setCategoryData(null)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchComparison()
  }, [fetchComparison])

  // Variance badge
  const getVarianceBadge = (percent: number, type: string) => {
    const color = getVarianceColor(percent, type as 'RICAVO' | 'COSTO')
    const colorClasses = {
      green: 'bg-green-100 text-green-700',
      red: 'bg-red-100 text-red-700',
      amber: 'bg-amber-100 text-amber-700',
      gray: 'bg-gray-100 text-gray-700',
    }

    return (
      <Badge className={colorClasses[color]}>
        {formatVariancePercent(percent)}
      </Badge>
    )
  }

  // Progress bar for variance
  const getVarianceProgress = (budget: number, actual: number) => {
    if (budget === 0) return 0
    const percent = (actual / budget) * 100
    return Math.min(Math.max(percent, 0), 150)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/budget">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Confronto Budget</h1>
            <p className="text-muted-foreground">
              Analisi scostamenti budget vs consuntivo
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchComparison}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna
        </Button>
      </div>

      {/* Filtri */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            {isAdmin && venues.length > 1 && (
              <Select
                value={filters.venueId}
                onValueChange={(v) => setFilters({ ...filters, venueId: v })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sede" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name} ({venue.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={filters.year.toString()}
              onValueChange={(v) => setFilters({ ...filters, year: parseInt(v) })}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Anno" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.length === 0 ? (
                  <SelectItem value={new Date().getFullYear().toString()}>
                    {new Date().getFullYear()}
                  </SelectItem>
                ) : (
                  availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select
              value={filters.accountType}
              onValueChange={(v) => setFilters({ ...filters, accountType: v as 'ALL' | 'RICAVO' | 'COSTO' })}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tutti</SelectItem>
                <SelectItem value="RICAVO">Ricavi</SelectItem>
                <SelectItem value="COSTO">Costi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !summary ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nessun budget trovato per i filtri selezionati</p>
            <Button variant="link" asChild className="mt-2">
              <Link href="/budget/nuovo">Crea nuovo budget</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Budget Totale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary.totalBudget)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Consuntivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary.totalActual)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Scostamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {summary.totalVariance >= 0 ? '+' : ''}{formatCurrency(summary.totalVariance)}
                </div>
                <Badge className={summary.totalVariance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                  {formatVariancePercent(summary.totalVariancePercent)}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Alert Attivi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {summary.alertsCount.active > 0 ? (
                    <>
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <span className="text-2xl font-bold text-amber-600">
                        {summary.alertsCount.active}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-green-600">0</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ricavi vs Costi Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Ricavi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Budget</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(summary.byType.RICAVO.budget)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Consuntivo</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(summary.byType.RICAVO.actual)}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Avanzamento</span>
                    <span>{getVarianceProgress(summary.byType.RICAVO.budget, summary.byType.RICAVO.actual).toFixed(0)}%</span>
                  </div>
                  <Progress
                    value={getVarianceProgress(summary.byType.RICAVO.budget, summary.byType.RICAVO.actual)}
                    className="h-2"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Scostamento</span>
                  {getVarianceBadge(summary.byType.RICAVO.variancePercent, 'RICAVO')}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Costi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Budget</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(summary.byType.COSTO.budget)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Consuntivo</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(summary.byType.COSTO.actual)}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Avanzamento</span>
                    <span>{getVarianceProgress(summary.byType.COSTO.budget, summary.byType.COSTO.actual).toFixed(0)}%</span>
                  </div>
                  <Progress
                    value={getVarianceProgress(summary.byType.COSTO.budget, summary.byType.COSTO.actual)}
                    className="h-2"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Scostamento</span>
                  {getVarianceBadge(summary.byType.COSTO.variancePercent, 'COSTO')}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Table with Tabs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Dettaglio Confronto</CardTitle>
                  <CardDescription>
                    Confronto budget vs consuntivo
                  </CardDescription>
                </div>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'categories' | 'accounts')}>
                  <TabsList>
                    <TabsTrigger value="categories" className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4" />
                      Categorie
                    </TabsTrigger>
                    <TabsTrigger value="accounts" className="flex items-center gap-2">
                      <List className="h-4 w-4" />
                      Conti
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {viewMode === 'categories' ? (
                /* Categories View */
                categoryData && categoryData.categories.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-2 text-left font-medium text-sm sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                            Categoria
                          </th>
                          <th className="p-2 text-right font-medium text-sm min-w-[100px]">
                            Budget
                          </th>
                          <th className="p-2 text-right font-medium text-sm min-w-[100px]">
                            Actual
                          </th>
                          <th className="p-2 text-right font-medium text-sm min-w-[100px]">
                            Varianza
                          </th>
                          <th className="p-2 text-right font-medium text-sm min-w-[80px]">
                            % Ric.
                          </th>
                          <th className="p-2 text-right font-medium text-sm min-w-[80px]">
                            Bench.
                          </th>
                          <th className="p-2 text-center font-medium text-sm min-w-[50px]">
                            St.
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Ricavi */}
                        {categoryData.categories.filter(c => c.categoryType === 'REVENUE').length > 0 && (
                          <>
                            <tr className="bg-green-50/50">
                              <td colSpan={7} className="p-2 font-semibold text-green-700 text-sm">
                                RICAVI
                              </td>
                            </tr>
                            {categoryData.categories
                              .filter(c => c.categoryType === 'REVENUE')
                              .map((cat) => (
                                <BudgetCategoryRow
                                  key={cat.id}
                                  category={cat}
                                  selectedMonth={null}
                                />
                              ))}
                          </>
                        )}
                        {/* Costi */}
                        {categoryData.categories.filter(c => c.categoryType !== 'REVENUE').length > 0 && (
                          <>
                            <tr className="bg-red-50/50">
                              <td colSpan={7} className="p-2 font-semibold text-red-700 text-sm">
                                COSTI
                              </td>
                            </tr>
                            {categoryData.categories
                              .filter(c => c.categoryType !== 'REVENUE')
                              .map((cat) => (
                                <BudgetCategoryRow
                                  key={cat.id}
                                  category={cat}
                                  selectedMonth={null}
                                />
                              ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nessuna categoria configurata</p>
                    <p className="text-sm mt-1">
                      Vai a Impostazioni &gt; Categorie Budget per configurare le categorie
                    </p>
                  </div>
                )
              ) : (
                /* Accounts View */
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                          Conto
                        </TableHead>
                        <TableHead className="text-center">Tipo</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Consuntivo</TableHead>
                        <TableHead className="text-right">Scostamento</TableHead>
                        <TableHead className="text-center">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisons.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            Nessun dato disponibile
                          </TableCell>
                        </TableRow>
                      ) : (
                        comparisons.map((comp) => (
                          <TableRow key={comp.accountId}>
                            <TableCell className="sticky left-0 bg-background z-10 font-medium">
                              <div className="flex flex-col">
                                <span>{comp.accountCode}</span>
                                <span className="text-xs text-muted-foreground">
                                  {comp.accountName}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={comp.accountType === 'RICAVO' ? 'default' : 'secondary'}>
                                {comp.accountType === 'RICAVO' ? 'R' : 'C'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(comp.budget.annual)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(comp.actual.annual)}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${comp.variance.annual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {comp.variance.annual >= 0 ? '+' : ''}{formatCurrency(comp.variance.annual)}
                            </TableCell>
                            <TableCell className="text-center">
                              {getVarianceBadge(comp.variancePercent.annual, comp.accountType)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
