'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Receipt,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  Clock,
  ArrowRight,
  Banknote,
  CreditCard,
  CalendarDays,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const CashFlowForecast = dynamic(
  () => import('@/components/dashboard/CashFlowForecast').then(mod => ({ default: mod.CashFlowForecast })),
  { ssr: false }
)

interface DashboardData {
  stats: {
    closuresToday: number
    journalEntriesThisMonth: number
    staffToday: number
  }
  income: {
    today: { cash: number; pos: number; total: number }
    week: { cash: number; pos: number; total: number }
    month: {
      cash: number
      pos: number
      total: number
      change: number
      daysWorked: number
      avgDaily: number
    }
    lastMonth: { total: number; daysWorked: number }
  }
  closures: {
    pending: Array<{
      id: string
      date: string
      dateFormatted: string
      venue: { name: string; code: string }
      status: string
    }>
    pendingCount: number
    recent: Array<{
      id: string
      date: string
      dateFormatted: string
      venue: { name: string; code: string }
      status: string
      totalIncome: number
      cashDifference: number
    }>
  }
  cashDifferences: Array<{
    closureId: string
    date: string
    venue: { name: string; code: string }
    stationName: string
    difference: number
    counted: number
    expected: number
  }>
  hasCashIssues: boolean
  meta: {
    isAdmin: boolean
    venues: Array<{ id: string; name: string; code: string }>
    currentMonth: string
    currentWeek: string
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
}: {
  title: string
  value: string | number
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend && trendValue && (
            <span
              className={
                trend === 'up'
                  ? 'text-green-600 flex items-center'
                  : trend === 'down'
                  ? 'text-red-600 flex items-center'
                  : ''
              }
            >
              {trend === 'up' && <TrendingUp className="h-3 w-3 mr-1" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3 mr-1" />}
              {trendValue}
            </span>
          )}
          <span>{subtitle}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  )
}

export function DashboardClient({ userName }: { userName?: string }) {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Errore nel caricamento dashboard')
      return res.json()
    },
    refetchInterval: 60000, // Refresh ogni minuto
  })

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">Errore nel caricamento della dashboard</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section + Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Benvenuto, {userName}
          </h1>
          <p className="text-muted-foreground">
            Ecco un riepilogo delle attività{' '}
            {data?.meta.currentMonth && `- ${data.meta.currentMonth}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button asChild size="sm">
            <Link href="/chiusura-cassa/nuova">
              <Receipt className="h-4 w-4 mr-2" />
              Nuova Chiusura
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/prima-nota">
              <BookOpen className="h-4 w-4 mr-2" />
              Prima Nota
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/report">
              <TrendingUp className="h-4 w-4 mr-2" />
              Report
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              title="Chiusure Oggi"
              value={data?.stats.closuresToday || 0}
              subtitle={
                data?.closures.pendingCount
                  ? `${data.closures.pendingCount} in attesa`
                  : 'Nessuna chiusura in attesa'
              }
              icon={Receipt}
            />
            <StatCard
              title="Movimenti Prima Nota"
              value={data?.stats.journalEntriesThisMonth || 0}
              subtitle="Movimenti del mese corrente"
              icon={BookOpen}
            />
            <StatCard
              title="Incasso Mensile"
              value={formatCurrency(data?.income.month.total || 0)}
              subtitle={
                data?.income.month.daysWorked
                  ? `Media: ${formatCurrency(data.income.month.avgDaily)}/giorno`
                  : 'Nessun dato disponibile'
              }
              icon={TrendingUp}
              trend={
                (data?.income.month.change || 0) > 0
                  ? 'up'
                  : (data?.income.month.change || 0) < 0
                  ? 'down'
                  : 'neutral'
              }
              trendValue={
                data?.income.month.change
                  ? `${data.income.month.change > 0 ? '+' : ''}${data.income.month.change.toFixed(1)}% vs mese scorso`
                  : undefined
              }
            />
            <StatCard
              title="Staff Oggi"
              value={data?.stats.staffToday || 0}
              subtitle="Dipendenti in servizio"
              icon={Users}
            />
          </>
        )}
      </div>

      {/* Income Breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Oggi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(data?.income.today.total || 0)}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    {formatCurrency(data?.income.today.cash || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {formatCurrency(data?.income.today.pos || 0)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Settimana ({data?.meta.currentWeek})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(data?.income.week.total || 0)}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    {formatCurrency(data?.income.week.cash || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {formatCurrency(data?.income.week.pos || 0)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Mese
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(data?.income.month.total || 0)}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    {formatCurrency(data?.income.month.cash || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {formatCurrency(data?.income.month.pos || 0)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Forecast */}
      <div className="grid gap-4 md:grid-cols-2">
        <CashFlowForecast />

        {/* Alerts Section */}
        <div className="space-y-4">
          {/* Cash Differences Alert */}
          {!isLoading && data?.hasCashIssues && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                Differenze Cassa
              </CardTitle>
              <CardDescription className="text-amber-700">
                Rilevate differenze significative (&gt; 5,00)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.cashDifferences.map((diff, idx) => (
                <Link
                  key={idx}
                  href={`/chiusura-cassa/${diff.closureId}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-amber-100 transition-colors"
                >
                  <div>
                    <span className="font-medium">{diff.stationName}</span>
                    <span className="text-sm text-amber-700 ml-2">
                      {diff.venue.code} -{' '}
                      {new Date(diff.date).toLocaleDateString('it-IT')}
                    </span>
                  </div>
                  <Badge
                    variant={diff.difference > 0 ? 'default' : 'destructive'}
                    className={
                      diff.difference > 0
                        ? 'bg-green-600'
                        : 'bg-red-600'
                    }
                  >
                    {diff.difference > 0 ? '+' : ''}
                    {formatCurrency(diff.difference)}
                  </Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Pending Closures */}
        {!isLoading && data?.closures?.pendingCount && data.closures.pendingCount > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-blue-800">
                <Clock className="h-5 w-5" />
                Chiusure in Attesa
              </CardTitle>
              <CardDescription className="text-blue-700">
                {data.closures.pendingCount} chiusure da completare/validare
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.closures.pending.slice(0, 5).map((closure) => (
                <Link
                  key={closure.id}
                  href={`/chiusura-cassa/${closure.id}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-blue-100 transition-colors"
                >
                  <div>
                    <span className="font-medium">{closure.dateFormatted}</span>
                    <span className="text-sm text-blue-700 ml-2">
                      {closure.venue.name}
                    </span>
                  </div>
                  <Badge
                    variant={closure.status === 'DRAFT' ? 'secondary' : 'default'}
                  >
                    {closure.status === 'DRAFT' ? 'Bozza' : 'Da validare'}
                  </Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      {/* Ultime Chiusure */}
      <Card>
          <CardHeader>
            <CardTitle>Ultime Chiusure</CardTitle>
            <CardDescription>Chiusure cassa recenti</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : data?.closures.recent.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Nessuna chiusura registrata
              </div>
            ) : (
              <div className="space-y-2">
                {data?.closures.recent.map((closure) => (
                  <Link
                    key={closure.id}
                    href={`/chiusura-cassa/${closure.id}`}
                    className="flex items-center justify-between p-2 rounded hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <span className="font-medium">{closure.dateFormatted}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {closure.venue.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatCurrency(closure.totalIncome)}
                      </span>
                      <Badge
                        variant={
                          closure.status === 'VALIDATED'
                            ? 'default'
                            : closure.status === 'SUBMITTED'
                            ? 'secondary'
                            : 'outline'
                        }
                        className={
                          closure.status === 'VALIDATED'
                            ? 'bg-green-600'
                            : ''
                        }
                      >
                        {closure.status === 'VALIDATED'
                          ? 'OK'
                          : closure.status === 'SUBMITTED'
                          ? 'Inviata'
                          : 'Bozza'}
                      </Badge>
                    </div>
                  </Link>
                ))}
                <Button variant="ghost" className="w-full mt-2" asChild>
                  <Link href="/chiusura-cassa">
                    Vedi tutte <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
      </Card>
    </div>
  )
}
