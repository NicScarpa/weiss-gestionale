'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  Banknote,
  CreditCard,
  Receipt,
  Minus,
  Trophy,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
interface Venue {
  id: string
  name: string
  code: string
}

interface DailyData {
  date: string
  displayDate: string
  dayOfWeek: string
  venue: Venue
  cashTotal: number
  posTotal: number
  grossTotal: number
  expensesTotal: number
  netTotal: number
  isEvent: boolean
  eventName: string | null
}

interface ReportData {
  period: {
    from: string
    to: string
    displayFrom: string
    displayTo: string
  }
  data: DailyData[]
  totals: {
    cashTotal: number
    posTotal: number
    grossTotal: number
    expensesTotal: number
    netTotal: number
    daysCount: number
  }
  averages: {
    dailyGross: number
    dailyNet: number
    dailyCash: number
    dailyPos: number
  }
  bestDay: DailyData | null
  worstDay: DailyData | null
  paymentBreakdown: {
    cashPercentage: number
    posPercentage: number
  }
  comparison: {
    previousGrossTotal: number
    previousDaysCount: number
    changePercentage: number
    changeAmount: number
  }
}

interface DailyRevenueClientProps {
  venueId?: string
  isAdmin: boolean
  venues: Venue[]
}

export function DailyRevenueClient({ venueId, isAdmin, venues }: DailyRevenueClientProps) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    venueId: venueId || '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.venueId) params.set('venueId', filters.venueId)

      const res = await fetch(`/api/report/incassi-giornalieri?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento')

      const result = await res.json()
      setData(result)
    } catch (error) {
      logger.error('Errore fetch report', error)
      toast.error('Errore nel caricamento del report')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const setQuickFilter = (period: 'thisMonth' | 'lastMonth' | 'last30' | 'last90') => {
    const now = new Date()
    let dateFrom: Date
    let dateTo: Date = now

    switch (period) {
      case 'thisMonth':
        dateFrom = startOfMonth(now)
        dateTo = endOfMonth(now)
        break
      case 'lastMonth':
        dateFrom = startOfMonth(subMonths(now, 1))
        dateTo = endOfMonth(subMonths(now, 1))
        break
      case 'last30':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'last90':
        dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
    }

    setFilters((prev) => ({
      ...prev,
      dateFrom: format(dateFrom, 'yyyy-MM-dd'),
      dateTo: format(dateTo, 'yyyy-MM-dd'),
    }))
  }

  const exportCSV = () => {
    if (!data) return

    const headers = ['Data', 'Giorno', 'Sede', 'Contanti', 'POS', 'Totale Lordo', 'Spese', 'Totale Netto', 'Evento']
    const rows = data.data.map((day) => [
      day.displayDate,
      day.dayOfWeek,
      day.venue.code,
      day.cashTotal.toFixed(2),
      day.posTotal.toFixed(2),
      day.grossTotal.toFixed(2),
      day.expensesTotal.toFixed(2),
      day.netTotal.toFixed(2),
      day.isEvent ? day.eventName || 'Si' : 'No',
    ])

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `incassi_${filters.dateFrom}_${filters.dateTo}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/report">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Incassi Giornalieri</h1>
            <p className="text-muted-foreground">
              Report dettagliato degli incassi per periodo
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={!data}>
            <Download className="h-4 w-4 mr-2" />
            Esporta CSV
          </Button>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Periodo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuickFilter('thisMonth')}>
              Mese corrente
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickFilter('lastMonth')}>
              Mese scorso
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickFilter('last30')}>
              Ultimi 30 giorni
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickFilter('last90')}>
              Ultimi 90 giorni
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
            {isAdmin && venues.length > 0 && (
              <Select
                value={filters.venueId || 'all'}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, venueId: v === 'all' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutte le sedi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le sedi</SelectItem>
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Caricamento...
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Nessun dato disponibile
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Totale Lordo</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.totals.grossTotal)}</div>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  {data.comparison.changePercentage >= 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                  )}
                  <span className={data.comparison.changePercentage >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {data.comparison.changePercentage >= 0 ? '+' : ''}
                    {data.comparison.changePercentage.toFixed(1)}%
                  </span>
                  <span className="ml-1">vs mese prec.</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Contanti</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.totals.cashTotal)}</div>
                <p className="text-xs text-muted-foreground">
                  {data.paymentBreakdown.cashPercentage.toFixed(1)}% del totale
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">POS</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.totals.posTotal)}</div>
                <p className="text-xs text-muted-foreground">
                  {data.paymentBreakdown.posPercentage.toFixed(1)}% del totale
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Media Giornaliera</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.averages.dailyGross)}</div>
                <p className="text-xs text-muted-foreground">
                  su {data.totals.daysCount} giorni
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Best/Worst Day */}
          <div className="grid gap-4 md:grid-cols-2">
            {data.bestDay && (
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700">
                    <Trophy className="h-4 w-4" />
                    Giorno Migliore
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-green-700">
                    {formatCurrency(data.bestDay.grossTotal)}
                  </div>
                  <p className="text-sm text-green-600">
                    {data.bestDay.displayDate} ({data.bestDay.dayOfWeek})
                    {data.bestDay.isEvent && (
                      <Badge variant="secondary" className="ml-2">
                        {data.bestDay.eventName || 'Evento'}
                      </Badge>
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {data.worstDay && data.totals.daysCount > 1 && (
              <Card className="border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
                    <AlertTriangle className="h-4 w-4" />
                    Giorno Peggiore
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-orange-700">
                    {formatCurrency(data.worstDay.grossTotal)}
                  </div>
                  <p className="text-sm text-orange-600">
                    {data.worstDay.displayDate} ({data.worstDay.dayOfWeek})
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Payment Breakdown Bar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ripartizione Pagamenti</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-4 rounded-full overflow-hidden">
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${data.paymentBreakdown.cashPercentage}%` }}
                />
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${data.paymentBreakdown.posPercentage}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Contanti: {data.paymentBreakdown.cashPercentage.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span>POS: {data.paymentBreakdown.posPercentage.toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card>
            <CardHeader>
              <CardTitle>Dettaglio Giornaliero</CardTitle>
              <CardDescription>
                {data.period.displayFrom} - {data.period.displayTo}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.data.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  Nessuna chiusura validata nel periodo selezionato
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Giorno</TableHead>
                        {isAdmin && <TableHead>Sede</TableHead>}
                        <TableHead className="text-right">Contanti</TableHead>
                        <TableHead className="text-right">POS</TableHead>
                        <TableHead className="text-right">Totale</TableHead>
                        <TableHead className="text-right">Spese</TableHead>
                        <TableHead className="text-right">Netto</TableHead>
                        <TableHead>Evento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.data.map((day) => (
                        <TableRow key={`${day.date}-${day.venue.id}`}>
                          <TableCell className="font-medium">{day.displayDate}</TableCell>
                          <TableCell>{day.dayOfWeek}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Badge variant="outline">{day.venue.code}</Badge>
                            </TableCell>
                          )}
                          <TableCell className="text-right font-mono">
                            {formatCurrency(day.cashTotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(day.posTotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(day.grossTotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            {day.expensesTotal > 0 ? `-${formatCurrency(day.expensesTotal)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(day.netTotal)}
                          </TableCell>
                          <TableCell>
                            {day.isEvent ? (
                              <Badge variant="secondary">{day.eventName || 'Evento'}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totali */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={isAdmin ? 3 : 2}>TOTALE</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(data.totals.cashTotal)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(data.totals.posTotal)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(data.totals.grossTotal)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          -{formatCurrency(data.totals.expensesTotal)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(data.totals.netTotal)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
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
