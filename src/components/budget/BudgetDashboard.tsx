'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Settings, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { BudgetKPICards } from './BudgetKPICards'
import { BudgetCategoryRow } from './BudgetCategoryRow'
import { BudgetTargetEditor } from './BudgetTargetEditor'
import { BudgetSetupWizard } from './BudgetSetupWizard'
import { BudgetAlerts } from './BudgetAlerts'
import { MONTH_LABELS_FULL } from '@/types/budget'

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

interface BudgetKPIs {
  targetRevenue: MonthlyWithAnnual
  totalRevenue: MonthlyWithAnnual
  totalCosts: MonthlyWithAnnual
  profit: MonthlyWithAnnual
  profitMargin: MonthlyWithAnnual
  liquidity: number
}

interface CategoryAggregationResult {
  budgetId: string
  year: number
  venue: { id: string; name: string; code: string }
  kpis: BudgetKPIs
  categories: CategoryData[]
  budgetName?: string
  budgetStatus?: string
}

interface BudgetDashboardProps {
  budgetId: string
  venueName?: string
}

const MONTHS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
]

async function fetchBudgetCategories(budgetId: string): Promise<CategoryAggregationResult> {
  const res = await fetch(`/api/budget/${budgetId}/categories`)
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore nel caricamento')
  }
  return res.json()
}

export function BudgetDashboard({ budgetId, venueName }: BudgetDashboardProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null) // null = annuale
  const [targetEditorOpen, setTargetEditorOpen] = useState(false)
  const [wizardSkipped, setWizardSkipped] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['budget-categories', budgetId],
    queryFn: () => fetchBudgetCategories(budgetId),
  })

  // Mostra wizard se non ci sono categorie e non e' stato skippato
  const shouldShowWizard = data && data.categories.length === 0 && !wizardSkipped

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-red-500 mb-4">
            {error instanceof Error ? error.message : 'Errore nel caricamento'}
          </p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Riprova
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Mostra wizard se non ci sono categorie (e non e' stato skippato)
  if (shouldShowWizard) {
    return (
      <BudgetSetupWizard
        venueId={data.venue.id}
        venueName={venueName || data.venue.name}
        year={data.year}
        budgetId={budgetId}
        onComplete={() => {
          refetch()
        }}
        onSkip={() => {
          setWizardSkipped(true)
        }}
      />
    )
  }

  // Separa categorie per tipo
  const revenueCategories = data.categories.filter((c) => c.categoryType === 'REVENUE')
  const costCategories = data.categories.filter(
    (c) => c.categoryType === 'COST' || c.categoryType === 'TAX' || c.categoryType === 'INVESTMENT'
  )

  return (
    <div className="space-y-6">
      {/* Header con filtri */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Dashboard Budget {data.year}
          </h2>
          <p className="text-sm text-muted-foreground">
            {venueName || data.venue.name} ({data.venue.code})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedMonth || 'annual'}
            onValueChange={(v) => setSelectedMonth(v === 'annual' ? null : v)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">Annuale</SelectItem>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTargetEditorOpen(true)}
            title="Configura target"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Aggiorna">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <BudgetKPICards kpis={data.kpis} selectedMonth={selectedMonth} />

      {/* Budget Alerts */}
      <BudgetAlerts budgetId={budgetId} />

      {/* Tabella Categorie */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Budget vs Consuntivo per Categoria
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                {/* Sezione Ricavi */}
                {revenueCategories.length > 0 && (
                  <>
                    <tr className="bg-green-50/50">
                      <td
                        colSpan={7}
                        className="p-2 font-semibold text-green-700 text-sm"
                      >
                        RICAVI
                      </td>
                    </tr>
                    {revenueCategories.map((cat) => (
                      <BudgetCategoryRow
                        key={cat.id}
                        category={cat}
                        selectedMonth={selectedMonth}
                      />
                    ))}
                  </>
                )}

                {/* Sezione Costi */}
                {costCategories.length > 0 && (
                  <>
                    <tr className="bg-red-50/50">
                      <td
                        colSpan={7}
                        className="p-2 font-semibold text-red-700 text-sm"
                      >
                        COSTI
                      </td>
                    </tr>
                    {costCategories.map((cat) => (
                      <BudgetCategoryRow
                        key={cat.id}
                        category={cat}
                        selectedMonth={selectedMonth}
                      />
                    ))}
                  </>
                )}

                {/* Nessuna categoria */}
                {data.categories.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Nessuna categoria configurata. Vai a Impostazioni &gt; Categorie
                      Budget per configurare le categorie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Target Editor Dialog */}
      <BudgetTargetEditor
        open={targetEditorOpen}
        onOpenChange={setTargetEditorOpen}
        venueId={data.venue.id}
        year={data.year}
        onSaved={() => refetch()}
      />
    </div>
  )
}
