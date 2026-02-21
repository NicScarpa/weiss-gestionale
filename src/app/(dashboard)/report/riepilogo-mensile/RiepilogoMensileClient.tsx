'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Calendar, TrendingUp, Wallet, CreditCard, Receipt, PiggyBank } from 'lucide-react'
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

interface ExpenseByAccount {
  id: string
  code: string
  name: string
  amount: number
}

interface MonthData {
  month: string
  monthShort: string
  monthNumber: number
  year: number
  daysWorked: number
  income: {
    cash: number
    pos: number
    gross: number
    avgDaily: number
  }
  expenses: {
    total: number
    byAccount: ExpenseByAccount[]
    avgDaily: number
  }
  net: {
    total: number
    avgDaily: number
  }
  margin: number
}

interface ReportData {
  year: number
  monthlyData: MonthData[]
  totals: {
    daysWorked: number
    income: {
      cash: number
      pos: number
      gross: number
    }
    expenses: {
      total: number
    }
    net: {
      total: number
    }
    margin: number
    expensesByAccount: ExpenseByAccount[]
  }
  averages: {
    dailyGross: number
    dailyExpenses: number
    dailyNet: number
    monthlyGross: number
    monthlyExpenses: number
    monthlyNet: number
  }
  highlights: {
    bestMonth: MonthData | null
    worstMonth: MonthData | null
    highestExpensesMonth: MonthData | null
    lowestExpensesMonth: MonthData | null
    bestMarginMonth: MonthData | null
    worstMarginMonth: MonthData | null
  }
  availableYears: number[]
}

export function RiepilogoMensileClient() {
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

        const response = await fetch(`/api/report/riepilogo-mensile?${params}`)
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
    return `${value.toFixed(1)}%`
  }

  const exportCSV = () => {
    if (!data) return

    const headers = [
      'Mese',
      'Giorni',
      'Incasso Lordo',
      'Contanti',
      'POS',
      'Spese',
      'Netto',
      'Margine %',
    ]

    const rows = data.monthlyData.map((month) => [
      month.month,
      month.daysWorked,
      month.income.gross.toFixed(2),
      month.income.cash.toFixed(2),
      month.income.pos.toFixed(2),
      month.expenses.total.toFixed(2),
      month.net.total.toFixed(2),
      month.margin.toFixed(1),
    ])

    // Add totals row
    rows.push([
      'TOTALE',
      data.totals.daysWorked,
      data.totals.income.gross.toFixed(2),
      data.totals.income.cash.toFixed(2),
      data.totals.income.pos.toFixed(2),
      data.totals.expenses.total.toFixed(2),
      data.totals.net.total.toFixed(2),
      data.totals.margin.toFixed(1),
    ])

    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.join(';')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `riepilogo-mensile-${data.year}.csv`
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
            <h1 className="text-2xl font-bold tracking-tight">Riepilogo Mensile</h1>
            <p className="text-muted-foreground">
              Entrate, uscite e margini per mese
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
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
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
          <div className="grid gap-4 md:grid-cols-4">
            {/* Gross Income */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <CardDescription>Incasso Lordo</CardDescription>
                </div>
                <CardTitle className="text-2xl text-green-600">
                  {formatCurrency(data.totals.income.gross)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Media: {formatCurrency(data.averages.monthlyGross)}/mese
                </p>
              </CardContent>
            </Card>

            {/* Cash */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-600" />
                  <CardDescription>Contanti</CardDescription>
                </div>
                <CardTitle className="text-2xl">
                  {formatCurrency(data.totals.income.cash)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data.totals.income.gross > 0
                    ? formatPercentage((data.totals.income.cash / data.totals.income.gross) * 100)
                    : '0%'} del totale
                </p>
              </CardContent>
            </Card>

            {/* POS */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-600" />
                  <CardDescription>POS</CardDescription>
                </div>
                <CardTitle className="text-2xl">
                  {formatCurrency(data.totals.income.pos)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data.totals.income.gross > 0
                    ? formatPercentage((data.totals.income.pos / data.totals.income.gross) * 100)
                    : '0%'} del totale
                </p>
              </CardContent>
            </Card>

            {/* Expenses */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-red-600" />
                  <CardDescription>Spese Totali</CardDescription>
                </div>
                <CardTitle className="text-2xl text-red-600">
                  -{formatCurrency(data.totals.expenses.total)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Media: {formatCurrency(data.averages.monthlyExpenses)}/mese
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Net Income Card */}
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5 text-primary" />
                  <CardDescription className="text-base font-medium">Netto {data.year}</CardDescription>
                </div>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  Margine: {formatPercentage(data.totals.margin)}
                </Badge>
              </div>
              <CardTitle className={`text-3xl ${data.totals.net.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(data.totals.net.total)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 text-sm text-muted-foreground">
                <span>{data.totals.daysWorked} giorni lavorati</span>
                <span>Media: {formatCurrency(data.averages.dailyNet)}/giorno</span>
              </div>
            </CardContent>
          </Card>

          {/* Highlights */}
          <div className="grid gap-4 md:grid-cols-3">
            {data.highlights.bestMonth && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-green-700">Mese Migliore (Incasso)</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.bestMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-green-700">
                    {formatCurrency(data.highlights.bestMonth.income.gross)}
                  </p>
                  <p className="text-sm text-green-600">
                    {data.highlights.bestMonth.daysWorked} giorni
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.bestMarginMonth && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-blue-700">Margine Migliore</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.bestMarginMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-blue-700">
                    {formatPercentage(data.highlights.bestMarginMonth.margin)}
                  </p>
                  <p className="text-sm text-blue-600">
                    Netto: {formatCurrency(data.highlights.bestMarginMonth.net.total)}
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.highestExpensesMonth && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-orange-700">Spese Maggiori</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.highestExpensesMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-orange-700">
                    {formatCurrency(data.highlights.highestExpensesMonth.expenses.total)}
                  </p>
                  <p className="text-sm text-orange-600">
                    {data.highlights.highestExpensesMonth.expenses.byAccount.length} categorie
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Monthly Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Andamento Mensile</CardTitle>
              <CardDescription>
                Incassi, spese e netto per mese
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.monthlyData.map((month) => {
                  const maxValue = Math.max(
                    ...data.monthlyData.map((m) => m.income.gross)
                  )
                  const incomeWidth = maxValue > 0 ? (month.income.gross / maxValue) * 100 : 0
                  const expenseWidth = maxValue > 0 ? (month.expenses.total / maxValue) * 100 : 0

                  return (
                    <div key={month.monthNumber} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize w-24">{month.monthShort}</span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-green-600 w-20 text-right">+{formatCurrency(month.income.gross)}</span>
                          <span className="text-red-600 w-20 text-right">-{formatCurrency(month.expenses.total)}</span>
                          <span className={`w-20 text-right font-medium ${month.net.total >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                            ={formatCurrency(month.net.total)}
                          </span>
                          <Badge variant={month.margin >= data.totals.margin ? 'default' : 'secondary'} className="w-16 justify-center">
                            {formatPercentage(month.margin)}
                          </Badge>
                        </div>
                      </div>
                      <div className="relative h-6 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="absolute top-0 left-0 h-full bg-green-400 transition-all duration-300"
                          style={{ width: `${incomeWidth}%` }}
                        />
                        <div
                          className="absolute top-0 left-0 h-full bg-red-400/70 transition-all duration-300"
                          style={{ width: `${expenseWidth}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-6 mt-6 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-400 rounded-sm" />
                  <span className="text-sm">Incassi</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-400 rounded-sm" />
                  <span className="text-sm">Spese</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Table */}
          <Card>
            <CardHeader>
              <CardTitle>Dettaglio Mensile</CardTitle>
              <CardDescription>
                Riepilogo completo entrate e uscite {data.year}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mese</TableHead>
                    <TableHead className="text-right">Giorni</TableHead>
                    <TableHead className="text-right">Lordo</TableHead>
                    <TableHead className="text-right">Contanti</TableHead>
                    <TableHead className="text-right">POS</TableHead>
                    <TableHead className="text-right">Spese</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="text-right">Margine</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthlyData.map((month) => (
                    <TableRow key={month.monthNumber}>
                      <TableCell className="font-medium capitalize">{month.month}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{month.daysWorked}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(month.income.gross)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(month.income.cash)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(month.income.pos)}</TableCell>
                      <TableCell className="text-right text-red-600">-{formatCurrency(month.expenses.total)}</TableCell>
                      <TableCell className={`text-right font-medium ${month.net.total >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {formatCurrency(month.net.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={month.margin >= data.totals.margin ? 'default' : 'secondary'}>
                          {formatPercentage(month.margin)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">TOTALE</TableCell>
                    <TableCell className="text-right font-bold">{data.totals.daysWorked}</TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      {formatCurrency(data.totals.income.gross)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(data.totals.income.cash)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(data.totals.income.pos)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600">
                      -{formatCurrency(data.totals.expenses.total)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${data.totals.net.total >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                      {formatCurrency(data.totals.net.total)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      <Badge>{formatPercentage(data.totals.margin)}</Badge>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Expenses by Category */}
          {data.totals.expensesByAccount.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Spese per Categoria</CardTitle>
                <CardDescription>
                  Dettaglio spese {data.year} per conto
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.totals.expensesByAccount.map((account) => {
                    const percentage = data.totals.expenses.total > 0
                      ? (account.amount / data.totals.expenses.total) * 100
                      : 0

                    return (
                      <div key={account.id} className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">
                              {account.code} - {account.name}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(account.amount)} ({formatPercentage(percentage)})
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-400 transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Data Message */}
          {data.totals.income.gross === 0 && data.totals.expenses.total === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <p>Nessun dato disponibile per {data.year}.</p>
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
