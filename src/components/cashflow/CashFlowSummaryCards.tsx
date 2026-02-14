import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface CashFlowSummaryCardsProps {
  saldoAttuale: number
  trend7gg: number
  previsione30gg: number
  deltaPrevisione: number
  runwayMesi: number
  burnRate: number
  prossimoAlert?: {
    tipo: string
    data: Date
    messaggio: string
  }
}

export function CashFlowSummaryCards({
  saldoAttuale,
  trend7gg,
  previsione30gg,
  deltaPrevisione,
  runwayMesi,
  burnRate,
  prossimoAlert,
}: CashFlowSummaryCardsProps) {
  const cards = [
    {
      title: 'Saldo Attuale',
      value: formatCurrency(saldoAttuale),
      icon: <TrendingUp className="h-5 w-5" />,
      trend: trend7gg,
      trendColor: trend7gg >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Previsione 30gg',
      value: formatCurrency(previsione30gg),
      icon: <TrendingUp className="h-5 w-5" />,
      trend: deltaPrevisione,
      trendColor: deltaPrevisione >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Runway',
      value: `${runwayMesi.toFixed(1)} mesi`,
      subtitle: `Burn: ${formatCurrency(burnRate)}/mese`,
      icon: <AlertTriangle className={cn('h-5 w-5', runwayMesi < 3 ? 'text-red-600' : 'text-green-600')} />,
    },
    {
      title: 'Prossimo Alert',
      value: prossimoAlert?.tipo || 'Nessuno',
      subtitle: prossimoAlert?.data ? new Date(prossimoAlert.data).toLocaleDateString('it-IT') : '-',
      icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {card.icon}
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              {card.value}
            </p>
            {card.subtitle && (
              <p className="text-sm text-muted-foreground mt-1">
                {card.subtitle}
              </p>
            )}
            {card.trend !== undefined && (
              <p className={cn('text-xs font-medium mt-1', card.trendColor)}>
                {card.trend > 0 ? '+' : ''}{card.trend.toFixed(1)}%
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
