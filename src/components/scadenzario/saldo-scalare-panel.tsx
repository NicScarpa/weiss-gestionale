"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SaldoScalareChart } from './saldo-scalare-chart'
import { formatCurrency } from '@/lib/utils'
import { format, parseISO, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { Info, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SaldoScalareData {
  saldoOggi: number
  pagamenti: { totale: number; ricorrenti: number }
  incassi: { totale: number; ricorrenti: number }
  saldoFinale: number
  scaduto: { daPagare: number; daIncassare: number; saldoFinaleIncluso: number }
  chartData: Array<{
    date: string
    saldo: number
    uscite: number
    entrate: number
    usciteRicorrenti: number
    entrateRicorrenti: number
  }>
  range: { from: string; to: string }
}

interface SaldoScalarePanelProps {
  visible: boolean
}

const RANGE_OPTIONS = [
  { value: '30', label: '30 giorni' },
  { value: '60', label: '60 giorni' },
  { value: '90', label: '90 giorni' },
  { value: '120', label: '120 giorni' },
  { value: '180', label: '180 giorni' },
  { value: '365', label: '1 anno' },
]

export function SaldoScalarePanel({ visible }: SaldoScalarePanelProps) {
  const [data, setData] = useState<SaldoScalareData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [range, setRange] = useState('90')
  const [showZeroLine, setShowZeroLine] = useState(false)
  const [showOverdue, setShowOverdue] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        range,
        includiScaduto: String(showOverdue),
      })
      const resp = await fetch(`/api/scadenzario/saldo-scalare?${params}`)
      const result = await resp.json()
      if (resp.ok) {
        setData(result)
      }
    } catch (error) {
      console.error('Errore fetch saldo scalare:', error)
    }
    setIsLoading(false)
  }, [range, showOverdue])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      fetchData()
    }
  }, [visible, fetchData])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!visible) return null

  const today = new Date()
  const endDate = addDays(today, parseInt(range))
  const dateRangeLabel = `${format(today, 'd MMM', { locale: it })} - ${format(endDate, 'd MMM', { locale: it })}`

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">{dateRangeLabel}</span>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant={showZeroLine ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowZeroLine(!showZeroLine)}
          >
            {showZeroLine ? (
              <>Escludi linea dello zero <X className="h-3 w-3" /></>
            ) : (
              'Includi linea dello zero'
            )}
          </Button>

          <Button
            variant={showOverdue ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowOverdue(!showOverdue)}
          >
            {showOverdue ? (
              <>Nascondi scaduto <X className="h-3 w-3" /></>
            ) : (
              'Mostra scaduto'
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Saldo oggi */}
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Saldo oggi</span>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  data.saldoOggi >= 0 ? 'text-slate-900' : 'text-rose-600'
                )}>
                  {formatCurrency(data.saldoOggi)}
                </p>
              </CardContent>
            </Card>

            {/* Pagamenti */}
            <Card className="border-l-4 border-l-rose-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Pagamenti</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">Pag!</Badge>
                </div>
                <p className="text-xl font-bold text-rose-600">
                  {formatCurrency(data.pagamenti.totale)}
                </p>
                {data.pagamenti.ricorrenti > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    di cui {formatCurrency(data.pagamenti.ricorrenti)} ricorrenti
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Incassi */}
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Incassi</span>
                </div>
                <p className="text-xl font-bold text-emerald-600">
                  {formatCurrency(data.incassi.totale)}
                </p>
                {data.incassi.ricorrenti > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    di cui {formatCurrency(data.incassi.ricorrenti)} ricorrenti
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Saldo finale */}
            <Card className="border-l-4 border-l-violet-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Saldo finale</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                    al {format(endDate, 'd MMM', { locale: it })}
                  </Badge>
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  data.saldoFinale >= 0 ? 'text-slate-900' : 'text-rose-600'
                )}>
                  {formatCurrency(data.saldoFinale)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Overdue summary row (when showOverdue is ON) */}
          {showOverdue && (
            <div className="flex items-center gap-6 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Scaduto da pagare:</span>
                <span className="font-semibold text-rose-600">{formatCurrency(data.scaduto.daPagare)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Scaduto da incassare:</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(data.scaduto.daIncassare)}</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-muted-foreground">Saldo finale incluso scaduto:</span>
                <span className="font-semibold">{formatCurrency(data.scaduto.saldoFinaleIncluso)}</span>
              </div>
            </div>
          )}

          {/* Chart */}
          <Card>
            <CardContent className="pt-4 pb-2 px-2">
              <SaldoScalareChart
                data={data.chartData}
                showZeroLine={showZeroLine}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
