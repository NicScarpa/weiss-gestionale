'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Download, Calendar, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface MonthData {
  month: string
  monthShort: string
  monthNumber: number
  current: {
    gross: number
    cash: number
    pos: number
    expenses: number
    net: number
    days: number
    avgDaily: number
  }
  previous: {
    gross: number
    cash: number
    pos: number
    expenses: number
    net: number
    days: number
    avgDaily: number
  }
  change: {
    amount: number
    percentage: number
  }
}

interface ReportData {
  currentYear: number
  previousYear: number
  monthlyData: MonthData[]
  totals: {
    current: {
      gross: number
      cash: number
      pos: number
      expenses: number
      net: number
      days: number
    }
    previous: {
      gross: number
      cash: number
      pos: number
      expenses: number
      net: number
      days: number
    }
    change: {
      amount: number
      percentage: number
    }
  }
  highlights: {
    bestMonth: MonthData | null
    worstMonth: MonthData | null
    bestGrowthMonth: MonthData | null
    worstGrowthMonth: MonthData | null
  }
  availableYears: number[]
}

export function ConfrontoAnnualeClient() {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        params.set('year', selectedYear.toString())

        const response = await fetch(`/api/report/confronto-annuale?${params}`)
        if (!response.ok) {
          throw new Error('Errore nel caricamento dei dati')
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore sconosciuto')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedYear])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  const getChangeIcon = (percentage: number) => {
    if (percentage > 0) return <TrendingUp className="h-4 w-4 text-green-600" />
    if (percentage < 0) return <TrendingDown className="h-4 w-4 text-red-600" />
    return <Minus className="h-4 w-4 text-gray-400" />
  }

  const getChangeBadge = (percentage: number) => {
    if (percentage > 0) {
      return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">{formatPercentage(percentage)}</Badge>
    }
    if (percentage < 0) {
      return <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100">{formatPercentage(percentage)}</Badge>
    }
    return <Badge variant="secondary">{formatPercentage(percentage)}</Badge>
  }

  const exportCSV = () => {
    if (!data) return

    const headers = [
      'Mese',
      `Incasso ${data.currentYear}`,
      `Incasso ${data.previousYear}`,
      'Variazione €',
      'Variazione %',
      `Giorni ${data.currentYear}`,
      `Giorni ${data.previousYear}`,
    ]

    const rows = data.monthlyData.map((month) => [
      month.month,
      month.current.gross.toFixed(2),
      month.previous.gross.toFixed(2),
      month.change.amount.toFixed(2),
      month.change.percentage.toFixed(1),
      month.current.days,
      month.previous.days,
    ])

    // Add totals row
    rows.push([
      'TOTALE',
      data.totals.current.gross.toFixed(2),
      data.totals.previous.gross.toFixed(2),
      data.totals.change.amount.toFixed(2),
      data.totals.change.percentage.toFixed(1),
      data.totals.current.days,
      data.totals.previous.days,
    ])

    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.join(';')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `confronto-annuale-${data.currentYear}-vs-${data.previousYear}.csv`
    link.click()
  }

  // Generate year options
  const yearOptions = data?.availableYears?.length
    ? data.availableYears
    : [currentYear, currentYear - 1, currentYear - 2]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/report">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Confronto Annuale</h1>
            <p className="text-muted-foreground">
              Analisi year-over-year degli incassi
            </p>
          </div>
        </div>
        <Button onClick={exportCSV} disabled={!data || loading} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Esporta CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedYear.toString()}
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">vs</span>
              <Badge variant="outline">{selectedYear - 1}</Badge>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-[400px] w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Data Display */}
      {!loading && data && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Current Year Total */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Totale {data.currentYear}</CardDescription>
                <CardTitle className="text-2xl">
                  {formatCurrency(data.totals.current.gross)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {getChangeIcon(data.totals.change.percentage)}
                  {getChangeBadge(data.totals.change.percentage)}
                  <span className="text-sm text-muted-foreground">
                    vs {data.previousYear}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {data.totals.current.days} giorni lavorati
                </p>
              </CardContent>
            </Card>

            {/* Previous Year Total */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Totale {data.previousYear}</CardDescription>
                <CardTitle className="text-2xl">
                  {formatCurrency(data.totals.previous.gross)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data.totals.previous.days} giorni lavorati
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Media: {formatCurrency(data.totals.previous.days > 0 ? data.totals.previous.gross / data.totals.previous.days : 0)}/giorno
                </p>
              </CardContent>
            </Card>

            {/* Difference */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Differenza</CardDescription>
                <CardTitle className={`text-2xl ${data.totals.change.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.totals.change.amount >= 0 ? '+' : ''}{formatCurrency(data.totals.change.amount)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {getChangeIcon(data.totals.change.percentage)}
                  <span className={`text-lg font-semibold ${data.totals.change.percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercentage(data.totals.change.percentage)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Highlights */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {data.highlights.bestMonth && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-green-700">Mese Migliore {data.currentYear}</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.bestMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-green-700">
                    {formatCurrency(data.highlights.bestMonth.current.gross)}
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.worstMonth && data.highlights.worstMonth.current.gross > 0 && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-orange-700">Mese Peggiore {data.currentYear}</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.worstMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-orange-700">
                    {formatCurrency(data.highlights.worstMonth.current.gross)}
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.bestGrowthMonth && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-blue-700">Maggiore Crescita</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.bestGrowthMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-blue-700">
                    {formatPercentage(data.highlights.bestGrowthMonth.change.percentage)}
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.worstGrowthMonth && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-red-700">Maggiore Calo</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.worstGrowthMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-red-700">
                    {formatPercentage(data.highlights.worstGrowthMonth.change.percentage)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Visual Chart - Bar comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Confronto Mensile
              </CardTitle>
              <CardDescription>
                Incassi lordi mensili {data.currentYear} vs {data.previousYear}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.monthlyData.map((month) => {
                  const maxValue = Math.max(
                    ...data.monthlyData.map((m) => Math.max(m.current.gross, m.previous.gross))
                  )
                  const currentWidth = maxValue > 0 ? (month.current.gross / maxValue) * 100 : 0
                  const previousWidth = maxValue > 0 ? (month.previous.gross / maxValue) * 100 : 0

                  return (
                    <div key={month.monthNumber} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize w-24">{month.monthShort}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-blue-600 w-24 text-right">{formatCurrency(month.current.gross)}</span>
                          <span className="text-gray-400 w-24 text-right">{formatCurrency(month.previous.gross)}</span>
                          {getChangeBadge(month.change.percentage)}
                        </div>
                      </div>
                      <div className="flex gap-1 h-6">
                        <div
                          className="bg-blue-500 rounded-sm transition-all duration-300"
                          style={{ width: `${currentWidth}%` }}
                          title={`${data.currentYear}: ${formatCurrency(month.current.gross)}`}
                        />
                      </div>
                      <div className="flex gap-1 h-4">
                        <div
                          className="bg-gray-300 rounded-sm transition-all duration-300"
                          style={{ width: `${previousWidth}%` }}
                          title={`${data.previousYear}: ${formatCurrency(month.previous.gross)}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-6 mt-6 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-sm" />
                  <span className="text-sm">{data.currentYear}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-300 rounded-sm" />
                  <span className="text-sm">{data.previousYear}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Table */}
          <Card>
            <CardHeader>
              <CardTitle>Dettaglio Mensile</CardTitle>
              <CardDescription>
                Confronto completo tra {data.currentYear} e {data.previousYear}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mese</TableHead>
                    <TableHead className="text-right">{data.currentYear}</TableHead>
                    <TableHead className="text-right">{data.previousYear}</TableHead>
                    <TableHead className="text-right">Variazione</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Giorni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthlyData.map((month) => (
                    <TableRow key={month.monthNumber}>
                      <TableCell className="font-medium capitalize">{month.month}</TableCell>
                      <TableCell className="text-right">{formatCurrency(month.current.gross)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(month.previous.gross)}
                      </TableCell>
                      <TableCell className={`text-right ${month.change.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {month.change.amount >= 0 ? '+' : ''}{formatCurrency(month.change.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {getChangeBadge(month.change.percentage)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {month.current.days} / {month.previous.days}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">TOTALE</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(data.totals.current.gross)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-muted-foreground">
                      {formatCurrency(data.totals.previous.gross)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${data.totals.change.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.totals.change.amount >= 0 ? '+' : ''}{formatCurrency(data.totals.change.amount)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {getChangeBadge(data.totals.change.percentage)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-muted-foreground">
                      {data.totals.current.days} / {data.totals.previous.days}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* No Data Message */}
          {data.totals.current.gross === 0 && data.totals.previous.gross === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <p>Nessun dato disponibile per il periodo selezionato.</p>
                <p className="mt-2">
                  Assicurati di avere chiusure cassa validate per visualizzare il report.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
