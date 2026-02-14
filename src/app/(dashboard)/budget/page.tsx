'use client'

import { useEffect, useState } from 'react'
import { CashFlowControls } from '@/components/cashflow/CashFlowControls'
import { CashFlowSummaryCards } from '@/components/cashflow/CashFlowSummaryCards'
import { CashFlowChart } from '@/components/cashflow/CashFlowChart'
import { AlertPanel } from '@/components/cashflow/AlertPanel'
import { format, subDays, addDays } from 'date-fns'

export default function CashflowDashboardPage() {
  const [dateFrom, setDateFrom] = useState(new Date(subDays(new Date(), 90)))
  const [dateTo, setDateTo] = useState(new Date())
  const [grouping, setGrouping] = useState<'daily' | 'weekly' | 'monthly'>('monthly')

  // Stato placeholder - sostituire con chiamate API reali
  const [summary, setSummary] = useState({
    saldoAttuale: 15000,
    trend7gg: 2.5,
    previsione30gg: 4500,
    deltaPrevisione: 150,
    runwayMesi: 10,
    burnRateMensile: 1500,
  })

  const [chartData, setChartData] = useState([
    { date: '2026-01-01', saldo: 15000, entrata: 500, uscita: 0 },
    { date: '2026-01-15', saldo: 15500, entrata: 800, uscita: 200 },
    { date: '2026-02-01', saldo: 16000, entrata: 600, uscita: 100 },
  ])

  const handlePreset = (days: number) => {
    const from = subDays(new Date(), days)
    setDateFrom(from)
    setDateTo(new Date())
  }

  // Fetch dati da API quando cambiano i filtri
  useEffect(() => {
    // TODO: fetch da /api/cashflow/summary e /api/cashflow/chart
  }, [dateFrom, dateTo, grouping])

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

      <CashFlowSummaryCards {...summary} />

      <CashFlowChart data={chartData} sogliaMinima={5000} />

      <AlertPanel />
    </div>
  )
}
