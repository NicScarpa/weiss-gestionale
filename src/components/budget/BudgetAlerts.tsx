'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle,
  Check,
  Bell,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/constants'

interface BudgetAlert {
  id: string
  budgetId: string
  categoryId: string | null
  accountId: string | null
  month: number | null
  monthLabel: string
  alertType: 'OVER_BUDGET' | 'UNDER_REVENUE'
  budgetAmount: number
  actualAmount: number
  varianceAmount: number
  variancePercent: number
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
  message: string | null
  createdAt: string
  budget: {
    id: string
    year: number
    name: string
    venue: { id: string; name: string; code: string }
  }
  category?: {
    id: string
    code: string
    name: string
    categoryType: string
  }
}

interface AlertsResponse {
  data: BudgetAlert[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface BudgetAlertsProps {
  budgetId?: string
  venueId?: string
  compact?: boolean
}

async function fetchAlerts(
  budgetId?: string,
  venueId?: string,
  status?: string
): Promise<AlertsResponse> {
  const params = new URLSearchParams()
  if (budgetId) params.set('budgetId', budgetId)
  if (venueId) params.set('venueId', venueId)
  if (status) params.set('status', status)
  params.set('limit', '20')

  const res = await fetch(`/api/budget/alerts?${params}`)
  if (!res.ok) throw new Error('Errore nel caricamento alert')
  return res.json()
}

async function acknowledgeAlert(alertId: string): Promise<void> {
  const res = await fetch('/api/budget/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertId }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore aggiornamento alert')
  }
}

export function BudgetAlerts({ budgetId, venueId, compact = false }: BudgetAlertsProps) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['budget-alerts', budgetId, venueId],
    queryFn: () => fetchAlerts(budgetId, venueId, 'ACTIVE'),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => {
      toast.success('Alert preso in carico')
      queryClient.invalidateQueries({ queryKey: ['budget-alerts'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-red-500 text-sm">Errore caricamento alert</p>
        </CardContent>
      </Card>
    )
  }

  const alerts = data?.data || []
  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE')

  if (activeAlerts.length === 0) {
    if (compact) return null

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alert Budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            <span className="text-sm">Nessun alert attivo</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-amber-600">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">
          {activeAlerts.length} alert attiv{activeAlerts.length === 1 ? 'o' : 'i'}
        </span>
      </div>
    )
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            Alert Budget ({activeAlerts.length})
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeAlerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start justify-between gap-3 p-3 bg-white rounded-lg border"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {alert.alertType === 'OVER_BUDGET' ? (
                  <ArrowUpCircle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                  <ArrowDownCircle className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <span className="font-medium text-sm truncate">
                  {alert.category?.name || alert.message || 'Alert'}
                </span>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {alert.alertType === 'OVER_BUDGET' ? 'Sforamento' : 'Sotto budget'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Budget: {formatCurrency(alert.budgetAmount)} | Actual:{' '}
                {formatCurrency(alert.actualAmount)} | Var:{' '}
                <span
                  className={
                    alert.varianceAmount > 0 ? 'text-red-600' : 'text-green-600'
                  }
                >
                  {alert.variancePercent > 0 ? '+' : ''}
                  {alert.variancePercent.toFixed(1)}%
                </span>
              </p>
              {alert.message && (
                <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => acknowledgeMutation.mutate(alert.id)}
              disabled={acknowledgeMutation.isPending}
            >
              <Check className="h-3 w-3 mr-1" />
              Visto
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
