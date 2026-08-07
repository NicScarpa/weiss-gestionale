'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CashFlowControls } from '@/components/cashflow/CashFlowControls'
import { CashFlowSummaryCards } from '@/components/cashflow/CashFlowSummaryCards'
import { CashFlowChart } from '@/components/cashflow/CashFlowChart'
import { CashFlowSourcePanel } from '@/components/cashflow/CashFlowSourcePanel'
import { ForecastSection } from '@/components/cashflow/ForecastSection'
import { AlertPanel } from '@/components/cashflow/AlertPanel'
import { subDays, differenceInDays } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * La pagina Cash Flow.
 *
 * Tutti i numeri che si vedono qui arrivano da `/api/cashflow/summary` e
 * `/api/cashflow/projection`, che a loro volta passano da `@/lib/saldi`: la
 * pagina non ricalcola nulla per conto suo. Le due sezioni in fondo —
 * composizione della previsione e previsioni salvate — sono l'interfaccia di
 * API che esistevano da mesi senza che nessuno potesse raggiungerle.
 */

interface Summary {
  saldoAttuale: number
  trend7gg: number
  previsione30gg: number
  deltaPrevisione: number
  runwayMesi: number
  burnRateMensile: number
  prossimoAlert?: { tipo: string; data: Date; messaggio: string } | null
}

interface PuntoProiezione {
  data: string
  saldo: number
  entrata: number
  uscita: number
}

const SUMMARY_VUOTO: Summary = {
  saldoAttuale: 0,
  trend7gg: 0,
  previsione30gg: 0,
  deltaPrevisione: 0,
  runwayMesi: 0,
  burnRateMensile: 0,
  prossimoAlert: null,
}

function giorno(data: Date): string {
  return data.toISOString().split('T')[0]
}

export default function CashflowDashboardPage() {
  const [dateFrom, setDateFrom] = useState(new Date(subDays(new Date(), 90)))
  const [dateTo, setDateTo] = useState(new Date())
  const [, setGrouping] = useState<'daily' | 'weekly' | 'monthly'>('monthly')

  const { data: summary, isLoading: caricaSummary } = useQuery({
    queryKey: ['cashflow', 'summary'],
    queryFn: async (): Promise<Summary> => {
      const risposta = await fetch('/api/cashflow/summary')
      if (!risposta.ok) throw new Error('Impossibile caricare il riepilogo del cash flow')
      return risposta.json()
    },
  })

  const { data: proiezione, isLoading: caricaProiezione } = useQuery({
    queryKey: ['cashflow', 'projection', giorno(dateFrom), giorno(dateTo)],
    queryFn: async (): Promise<PuntoProiezione[]> => {
      const risposta = await fetch(
        `/api/cashflow/projection?from=${giorno(dateFrom)}&days=${Math.max(
          1,
          differenceInDays(dateTo, dateFrom)
        )}`
      )
      if (!risposta.ok) throw new Error('Impossibile caricare la proiezione del saldo')
      return risposta.json()
    },
  })

  const dati = summary ?? SUMMARY_VUOTO

  const handlePreset = (days: number) => {
    setDateFrom(subDays(new Date(), days))
    setDateTo(new Date())
  }

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

      {caricaSummary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-lg" />
          ))}
        </div>
      ) : (
        <CashFlowSummaryCards
          saldoAttuale={dati.saldoAttuale}
          trend7gg={dati.trend7gg}
          previsione30gg={dati.previsione30gg}
          deltaPrevisione={dati.deltaPrevisione}
          runwayMesi={dati.runwayMesi}
          burnRate={dati.burnRateMensile}
          prossimoAlert={dati.prossimoAlert ?? undefined}
        />
      )}

      {caricaProiezione ? (
        <Skeleton className="h-[300px] rounded-lg" />
      ) : (
        <CashFlowChart
          data={(proiezione ?? []).map((punto) => ({
            date: punto.data,
            saldo: punto.saldo,
            entrata: punto.entrata,
            uscita: punto.uscita,
          }))}
          sogliaMinima={5000}
        />
      )}

      <CashFlowSourcePanel previsioneMedia={summary?.previsione30gg} />

      <ForecastSection saldoAttuale={summary?.saldoAttuale} />

      <AlertPanel />
    </div>
  )
}
