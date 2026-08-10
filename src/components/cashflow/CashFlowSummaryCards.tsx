import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, AlertTriangle, Infinity as InfinityIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'

/**
 * Le quattro card in testa alla pagina Cash Flow.
 *
 * Ogni cifra arriva da `/api/cashflow/summary` e da lì, a monte, da
 * `@/lib/saldi`: qui non si ricalcola nulla, si formatta soltanto. Le due
 * variazioni — `trend7gg` e `deltaPrevisione` — sono **importi in euro**
 * (differenze fra due saldi), non percentuali: venivano stampate con un `%`
 * accanto, e un mese in cui erano entrati 1.234,56 € si leggeva come «+1234,6%».
 */

/** Valore con cui l'API dice "il saldo non sta scendendo, non c'è un limite". */
const RUNWAY_ILLIMITATO = 999

interface CashFlowSummaryCardsProps {
  saldoAttuale: number
  /** Differenza in euro fra il saldo di oggi e quello di sette giorni fa. */
  trend7gg: number
  previsione30gg: number
  /** Variazione in euro attesa nei prossimi trenta giorni. */
  deltaPrevisione: number
  runwayMesi: number
  burnRate: number
  prossimoAlert?: {
    tipo: string
    data: Date
    messaggio: string
  }
}

/** Un importo con il segno sempre visibile: «+1.234,56 €», «-800,00 €». */
function conSegno(importo: number): string {
  return `${importo > 0 ? '+' : ''}${formatCurrency(importo)}`
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
  const cassaIllimitata = runwayMesi >= RUNWAY_ILLIMITATO || burnRate <= 0

  const cards = [
    {
      title: 'Saldo Attuale',
      value: formatCurrency(saldoAttuale),
      icon: <TrendingUp className="h-5 w-5" />,
      variazione: conSegno(trend7gg),
      variazioneLabel: 'negli ultimi 7 giorni',
      variazioneColor: trend7gg >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Previsione 30gg',
      value: formatCurrency(previsione30gg),
      icon: deltaPrevisione >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />,
      variazione: conSegno(deltaPrevisione),
      variazioneLabel: 'variazione attesa',
      variazioneColor: deltaPrevisione >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Runway',
      value: cassaIllimitata ? 'Illimitato' : `${runwayMesi.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mesi`,
      subtitle: cassaIllimitata
        ? 'La cassa non sta scendendo'
        : `Burn: ${formatCurrency(burnRate)}/mese`,
      icon: cassaIllimitata ? (
        <InfinityIcon className="h-5 w-5 text-green-600" />
      ) : (
        <AlertTriangle className={cn('h-5 w-5', runwayMesi < 3 ? 'text-red-600' : 'text-green-600')} />
      ),
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
            <p className="text-2xl font-bold font-mono break-words">
              {card.value}
            </p>
            {card.subtitle && (
              <p className="text-sm text-muted-foreground mt-1">
                {card.subtitle}
              </p>
            )}
            {card.variazione && (
              <p className="text-xs font-medium mt-1">
                <span className={cn('font-mono', card.variazioneColor)}>{card.variazione}</span>
                <span className="text-muted-foreground"> {card.variazioneLabel}</span>
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
