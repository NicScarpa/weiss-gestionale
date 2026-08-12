import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScheduleSummary } from '@/types/schedule'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, AlertTriangle, HelpCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'

interface ScheduleSummaryCardsProps {
  summary: ScheduleSummary
  isLoading?: boolean
  /** Filtra la lista sulle scadenze pagate senza movimento di prima nota. */
  onPagateSenzaMovimentoClick?: () => void
}

export function ScheduleSummaryCards({ summary, isLoading = false, onPagateSenzaMovimentoClick }: ScheduleSummaryCardsProps) {
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
      value: summary.aperteAttiveCount,
      amount: summary.aperteAttiveImporto,
      icon: ArrowDownLeft,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      description: `${summary.aperteAttiveCount} scadenze attive`,
    },
    {
      title: 'Da pagare',
      value: summary.apertePassiveCount,
      amount: summary.apertePassiveImporto,
      icon: ArrowUpRight,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      description: `${summary.apertePassiveCount} scadenze passive`,
    },
    // Solo quando c'è qualcosa da vedere: una card a zero è rumore quotidiano
    ...(summary.pagateSenzaMovimento > 0
      ? [{
          title: 'Pagate senza movimento',
          value: summary.pagateSenzaMovimento,
          amount: summary.pagateSenzaMovimentoImporto,
          icon: HelpCircle,
          color: 'text-slate-600',
          bgColor: 'bg-slate-50',
          description:
            'Pagamento registrato ma nessun movimento in prima nota: ' +
            'spesso è corretto (contanti, addebiti registrati altrove), ' +
            'ma queste uscite non compaiono nel saldo.',
          onClick: onPagateSenzaMovimentoClick,
        }]
      : []),
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
          <Card
            key={index}
            className={`${card.bgColor} border-none ${card.onClick ? 'cursor-pointer hover:brightness-95 transition-[filter]' : ''}`}
            onClick={card.onClick}
          >
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
