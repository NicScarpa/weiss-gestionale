'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Calendar, TrendingUp, TrendingDown, Receipt, Users, FolderTree, Minus } from 'lucide-react'
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
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

interface Venue {
  id: string
  name: string
  code: string
}

interface CategoryData {
  id: string
  code: string
  name: string
  amount: number
  count: number
  percentage: number
  avgAmount: number
}

interface PayeeData {
  payee: string
  amount: number
  count: number
  percentage: number
  avgAmount: number
  categories: string[]
}

interface MonthData {
  month: string
  monthShort: string
  monthKey: string
  amount: number
  count: number
  avgAmount: number
  byCategory: { name: string; amount: number }[]
  change: number
  changePercentage: number
}

interface TopExpense {
  id: string
  date: string
  payee: string
  description: string | null
  amount: number
  category: string
  venue: string
}

interface ReportData {
  period: {
    from: string
    to: string
    displayFrom: string
    displayTo: string
  }
  stats: {
    totalExpenses: number
    expenseCount: number
    avgExpense: number
    categoriesCount: number
    payeesCount: number
    monthsWithExpenses: number
    avgMonthly: number
  }
  byCategory: CategoryData[]
  byPayee: PayeeData[]
  byMonth: MonthData[]
  topExpenses: TopExpense[]
  highlights: {
    topCategory: CategoryData | null
    topPayee: PayeeData | null
    highestMonth: MonthData | null
    lowestMonth: MonthData | null
  }
  comparison: {
    previousTotal: number
    change: number
    changePercentage: number
  }
}

interface AnalisiCostiClientProps {
  venueId?: string
  isAdmin: boolean
  venues: Venue[]
}

type QuickPeriod = 'thisYear' | 'lastYear' | 'last6Months' | 'last3Months' | 'thisMonth'

export function AnalisiCostiClient({
  venueId,
  isAdmin,
  venues,
}: AnalisiCostiClientProps) {
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('thisYear')
  const [selectedVenue, setSelectedVenue] = useState<string>(venueId || 'all')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Calculate date range based on quick period
  const getDateRange = (period: QuickPeriod) => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    switch (period) {
      case 'thisYear':
        return {
          from: `${year}-01-01`,
          to: `${year}-12-31`,
        }
      case 'lastYear':
        return {
          from: `${year - 1}-01-01`,
          to: `${year - 1}-12-31`,
        }
      case 'last6Months':
        const sixMonthsAgo = new Date(year, month - 6, 1)
        return {
          from: sixMonthsAgo.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0],
        }
      case 'last3Months':
        const threeMonthsAgo = new Date(year, month - 3, 1)
        return {
          from: threeMonthsAgo.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0],
        }
      case 'thisMonth':
        return {
          from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
          to: now.toISOString().split('T')[0],
        }
    }
  }

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const dateRange = getDateRange(quickPeriod)
        const params = new URLSearchParams()
        params.set('dateFrom', dateRange.from)
        params.set('dateTo', dateRange.to)
        if (selectedVenue && selectedVenue !== 'all') {
          params.set('venueId', selectedVenue)
        }

        const response = await fetch(`/api/report/analisi-costi?${params}`)
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
  }, [quickPeriod, selectedVenue])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const getChangeIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-red-600" />
    if (value < 0) return <TrendingDown className="h-4 w-4 text-green-600" />
    return <Minus className="h-4 w-4 text-gray-400" />
  }

  const exportCSV = () => {
    if (!data) return

    // Export by category
    const categoryHeaders = ['Categoria', 'Codice', 'Importo', 'N. Spese', 'Media', 'Percentuale']
    const categoryRows = data.byCategory.map((cat) => [
      cat.name,
      cat.code,
      cat.amount.toFixed(2),
      cat.count,
      cat.avgAmount.toFixed(2),
      cat.percentage.toFixed(1),
    ])

    // Export by payee
    const payeeHeaders = ['Fornitore', 'Importo', 'N. Spese', 'Media', 'Percentuale', 'Categorie']
    const payeeRows = data.byPayee.map((p) => [
      p.payee,
      p.amount.toFixed(2),
      p.count,
      p.avgAmount.toFixed(2),
      p.percentage.toFixed(1),
      p.categories.join(', '),
    ])

    const csvContent = [
      `Analisi Costi - ${data.period.displayFrom} a ${data.period.displayTo}`,
      '',
      'PER CATEGORIA',
      categoryHeaders.join(';'),
      ...categoryRows.map((row) => row.join(';')),
      '',
      'PER FORNITORE',
      payeeHeaders.join(';'),
      ...payeeRows.map((row) => row.join(';')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `analisi-costi-${data.period.from}-${data.period.to}.csv`
    link.click()
  }

  const periodLabels: Record<QuickPeriod, string> = {
    thisYear: 'Anno corrente',
    lastYear: 'Anno scorso',
    last6Months: 'Ultimi 6 mesi',
    last3Months: 'Ultimi 3 mesi',
    thisMonth: 'Mese corrente',
  }

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
            <h1 className="text-2xl font-bold tracking-tight">Analisi Costi</h1>
            <p className="text-muted-foreground">
              Monitoraggio spese per categoria e fornitore
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
                value={quickPeriod}
                onValueChange={(v) => setQuickPeriod(v as QuickPeriod)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(periodLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isAdmin && venues.length > 0 && (
              <Select
                value={selectedVenue}
                onValueChange={setSelectedVenue}
              >
                <SelectTrigger className="w-[180px]">
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

            {data && (
              <Badge variant="outline" className="ml-auto">
                {data.period.displayFrom} - {data.period.displayTo}
              </Badge>
            )}
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
            {/* Total Expenses */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-red-600" />
                  <CardDescription>Totale Spese</CardDescription>
                </div>
                <CardTitle className="text-2xl text-red-600">
                  {formatCurrency(data.stats.totalExpenses)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  {getChangeIcon(data.comparison.changePercentage)}
                  <span className={data.comparison.changePercentage > 0 ? 'text-red-600' : 'text-green-600'}>
                    {data.comparison.changePercentage > 0 ? '+' : ''}{formatPercentage(data.comparison.changePercentage)}
                  </span>
                  <span className="text-muted-foreground">vs periodo prec.</span>
                </div>
              </CardContent>
            </Card>

            {/* Expense Count */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Numero Spese</CardDescription>
                <CardTitle className="text-2xl">
                  {data.stats.expenseCount}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Media: {formatCurrency(data.stats.avgExpense)}
                </p>
              </CardContent>
            </Card>

            {/* Categories */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4 text-blue-600" />
                  <CardDescription>Categorie</CardDescription>
                </div>
                <CardTitle className="text-2xl">
                  {data.stats.categoriesCount}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.highlights.topCategory && (
                  <p className="text-sm text-muted-foreground truncate">
                    Top: {data.highlights.topCategory.name}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Payees */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-600" />
                  <CardDescription>Fornitori</CardDescription>
                </div>
                <CardTitle className="text-2xl">
                  {data.stats.payeesCount}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.highlights.topPayee && (
                  <p className="text-sm text-muted-foreground truncate">
                    Top: {data.highlights.topPayee.payee}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Highlights */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {data.highlights.topCategory && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-blue-700">Categoria Principale</CardDescription>
                  <CardTitle className="text-lg">{data.highlights.topCategory.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-blue-700">
                    {formatCurrency(data.highlights.topCategory.amount)}
                  </p>
                  <p className="text-sm text-blue-600">
                    {formatPercentage(data.highlights.topCategory.percentage)} del totale
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.topPayee && (
              <Card className="border-purple-200 bg-purple-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-purple-700">Fornitore Principale</CardDescription>
                  <CardTitle className="text-lg truncate">{data.highlights.topPayee.payee}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-purple-700">
                    {formatCurrency(data.highlights.topPayee.amount)}
                  </p>
                  <p className="text-sm text-purple-600">
                    {data.highlights.topPayee.count} transazioni
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.highestMonth && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-red-700">Mese Più Costoso</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.highestMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-red-700">
                    {formatCurrency(data.highlights.highestMonth.amount)}
                  </p>
                  <p className="text-sm text-red-600">
                    {data.highlights.highestMonth.count} spese
                  </p>
                </CardContent>
              </Card>
            )}

            {data.highlights.lowestMonth && data.highlights.lowestMonth.amount > 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-2">
                  <CardDescription className="text-green-700">Mese Meno Costoso</CardDescription>
                  <CardTitle className="text-lg capitalize">{data.highlights.lowestMonth.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-green-700">
                    {formatCurrency(data.highlights.lowestMonth.amount)}
                  </p>
                  <p className="text-sm text-green-600">
                    {data.highlights.lowestMonth.count} spese
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Tabs for different views */}
          <Tabs defaultValue="categories" className="space-y-4">
            <TabsList>
              <TabsTrigger value="categories">Per Categoria</TabsTrigger>
              <TabsTrigger value="payees">Per Fornitore</TabsTrigger>
              <TabsTrigger value="monthly">Andamento Mensile</TabsTrigger>
              <TabsTrigger value="top">Spese Maggiori</TabsTrigger>
            </TabsList>

            {/* By Category */}
            <TabsContent value="categories">
              <Card>
                <CardHeader>
                  <CardTitle>Spese per Categoria</CardTitle>
                  <CardDescription>
                    Distribuzione delle spese per tipo di costo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.byCategory.length > 0 ? (
                    <div className="space-y-4">
                      {data.byCategory.map((cat) => (
                        <div key={cat.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{cat.code}</Badge>
                              <span className="font-medium">{cat.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold">{formatCurrency(cat.amount)}</span>
                              <span className="text-muted-foreground ml-2">
                                ({formatPercentage(cat.percentage)})
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${cat.percentage}%` }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground w-24 text-right">
                              {cat.count} spese
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nessuna spesa nel periodo selezionato
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* By Payee */}
            <TabsContent value="payees">
              <Card>
                <CardHeader>
                  <CardTitle>Spese per Fornitore</CardTitle>
                  <CardDescription>
                    Distribuzione delle spese per beneficiario
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.byPayee.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fornitore</TableHead>
                          <TableHead className="text-right">Importo</TableHead>
                          <TableHead className="text-right">N. Spese</TableHead>
                          <TableHead className="text-right">Media</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead>Categorie</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byPayee.slice(0, 20).map((payee, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{payee.payee}</TableCell>
                            <TableCell className="text-right">{formatCurrency(payee.amount)}</TableCell>
                            <TableCell className="text-right">{payee.count}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatCurrency(payee.avgAmount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{formatPercentage(payee.percentage)}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {payee.categories.slice(0, 2).map((cat, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {cat}
                                  </Badge>
                                ))}
                                {payee.categories.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{payee.categories.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nessuna spesa nel periodo selezionato
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Monthly Trend */}
            <TabsContent value="monthly">
              <Card>
                <CardHeader>
                  <CardTitle>Andamento Mensile</CardTitle>
                  <CardDescription>
                    Evoluzione delle spese nel tempo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.byMonth.some((m) => m.amount > 0) ? (
                    <div className="space-y-4">
                      {data.byMonth.map((month) => {
                        const maxAmount = Math.max(...data.byMonth.map((m) => m.amount))
                        const width = maxAmount > 0 ? (month.amount / maxAmount) * 100 : 0

                        return (
                          <div key={month.monthKey} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium capitalize w-32">{month.month}</span>
                              <div className="flex items-center gap-4">
                                <span className="w-24 text-right">{formatCurrency(month.amount)}</span>
                                <span className="w-16 text-right text-muted-foreground">{month.count} spese</span>
                                <div className="flex items-center gap-1 w-20">
                                  {month.change !== 0 && (
                                    <>
                                      {getChangeIcon(month.changePercentage)}
                                      <span className={`text-xs ${month.changePercentage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {month.changePercentage > 0 ? '+' : ''}{formatPercentage(month.changePercentage)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="h-6 bg-gray-100 rounded overflow-hidden">
                              <div
                                className="h-full bg-red-400 transition-all duration-300"
                                style={{ width: `${width}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nessuna spesa nel periodo selezionato
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Top Expenses */}
            <TabsContent value="top">
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 Spese Maggiori</CardTitle>
                  <CardDescription>
                    Le spese singole più rilevanti del periodo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.topExpenses.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Fornitore</TableHead>
                          <TableHead>Descrizione</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead className="text-right">Importo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.topExpenses.map((expense) => (
                          <TableRow key={expense.id}>
                            <TableCell className="text-muted-foreground">{expense.date}</TableCell>
                            <TableCell className="font-medium">{expense.payee}</TableCell>
                            <TableCell className="text-muted-foreground truncate max-w-[200px]">
                              {expense.description || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{expense.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold text-red-600">
                              {formatCurrency(expense.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nessuna spesa nel periodo selezionato
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* No Data Message */}
          {data.stats.totalExpenses === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <p>Nessuna spesa nel periodo selezionato.</p>
                <p className="mt-2">
                  Seleziona un periodo diverso o assicurati di avere chiusure cassa validate con spese registrate.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
