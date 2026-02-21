import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScheduleSummary } from '@/types/schedule'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ScheduleSummaryCardsProps {
  summary: ScheduleSummary
  isLoading?: boolean
}

export function ScheduleSummaryCards({ summary, isLoading = false }: ScheduleSummaryCardsProps) {
  const cards = [
    {
      title: 'Scadute',
      value: summary.totaleScadute,
      amount: summary.totaleScaduteImporto,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      description: `${summary.totaleScadute} scadenze scadute`,
    },
    {
      title: 'Prossimi 7gg',
      value: summary.totaleInScadenza7Giorni,
      amount: summary.totaleInScadenza7GiorniImporto,
      icon: CalendarClock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      description: `${summary.totaleInScadenza7Giorni} in scadenza`,
    },
    {
      title: 'Da incassare',
      value: summary.totaleAperte,
      amount: summary.totaleAttive,
      icon: ArrowDownLeft,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      description: `${summary.totaleAperte} scadenze attive`,
    },
    {
      title: 'Da pagare',
      value: summary.totalePagate,
      amount: summary.totalePassive,
      icon: ArrowUpRight,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      description: `${summary.totalePagate} scadenze passive`,
    },
  ]

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="h-4 w-24 bg-muted rounded" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <div className="h-8 w-20 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <Card key={index} className={`${card.bgColor} border-none`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">{card.value}</div>
                  {card.amount > 0 && (
                    <span className={`text-sm font-medium ${card.color}`}>
                      {formatCurrency(card.amount)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
