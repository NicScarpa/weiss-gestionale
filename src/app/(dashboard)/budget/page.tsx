'use client'

import { useEffect, useState, useCallback } from 'react'
import { CashFlowControls } from '@/components/cashflow/CashFlowControls'
import { CashFlowSummaryCards } from '@/components/cashflow/CashFlowSummaryCards'
import { CashFlowChart } from '@/components/cashflow/CashFlowChart'
import { AlertPanel } from '@/components/cashflow/AlertPanel'
import { subDays, differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

export default function CashflowDashboardPage() {
  const [dateFrom, setDateFrom] = useState(new Date(subDays(new Date(), 90)))
  const [dateTo, setDateTo] = useState(new Date())
  const [grouping, setGrouping] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [isLoading, setIsLoading] = useState(true)

  const [summary, setSummary] = useState({
    saldoAttuale: 0,
    trend7gg: 0,
    previsione30gg: 0,
    deltaPrevisione: 0,
    runwayMesi: 0,
    burnRate: 0,
    prossimoAlert: undefined as { tipo: string; data: Date; messaggio: string } | undefined,
  })

  const [chartData, setChartData] = useState<Array<{ date: string; saldo: number; entrata: number; uscita: number }>>([])

  const handlePreset = (days: number) => {
    const from = subDays(new Date(), days)
    setDateFrom(from)
    setDateTo(new Date())
  }

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [summaryRes, projectionRes] = await Promise.all([
        fetch('/api/cashflow/summary'),
        fetch(`/api/cashflow/projection?from=${dateFrom.toISOString().split('T')[0]}&days=${differenceInDays(dateTo, dateFrom)}`),
      ])

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        setSummary({
          saldoAttuale: summaryData.saldoAttuale || 0,
          trend7gg: summaryData.trend7gg || 0,
          previsione30gg: summaryData.previsione30gg || 0,
          deltaPrevisione: summaryData.deltaPrevisione || 0,
          runwayMesi: summaryData.runwayMesi || 0,
          burnRate: summaryData.burnRateMensile || 0,
          prossimoAlert: summaryData.prossimoAlert || undefined,
        })
      }

      if (projectionRes.ok) {
        const projectionData = await projectionRes.json()
        // Map API field `data` to component field `date`
        setChartData(
          (projectionData || []).map((p: { data: string; saldo: number; entrata: number; uscita: number }) => ({
            date: p.data,
            saldo: p.saldo,
            entrata: p.entrata,
            uscita: p.uscita,
          }))
        )
      }
    } catch (error) {
      console.error('Errore caricamento cash flow:', error)
      toast.error('Impossibile caricare i dati del cash flow')
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Cash Flow</h1>

      <CashFlowControls
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onPreset={handlePreset}
        onGrouping={setGrouping}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-lg" />
          ))}
        </div>
      ) : (
        <CashFlowSummaryCards {...summary} />
      )}

      {isLoading ? (
        <Skeleton className="h-[300px] rounded-lg" />
      ) : (
        <CashFlowChart data={chartData} sogliaMinima={5000} />
      )}

      <AlertPanel />
    </div>
  )
}
