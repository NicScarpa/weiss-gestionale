import { CheckCircle2, Clock } from 'lucide-react'
import type { StatoLegenda } from '@/types/reconciliation'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export const ETICHETTE_STATO: Record<StatoLegenda, string> = {
  riconciliato: 'Riconciliato',
  abbinato_manualmente: 'Abbinato manualmente',
  parziale: 'Parzialmente abbinato',
  non_abbinato: 'Non abbinato',
}

// Colore e forma insieme, mai il colore da solo (spec, «La pagina»).
const STILE: Record<StatoLegenda, { Icona: typeof Clock; classe: string }> = {
  riconciliato: { Icona: CheckCircle2, classe: 'bg-emerald-600 text-white' },
  abbinato_manualmente: { Icona: CheckCircle2, classe: 'bg-orange-500 text-white' },
  parziale: { Icona: Clock, classe: 'bg-orange-500 text-white' },
  non_abbinato: { Icona: Clock, classe: 'bg-violet-600 text-white' },
}

export function IconaStato({ stato, residuo }: { stato: StatoLegenda; residuo: number }) {
  const { Icona, classe } = STILE[stato]
  return (
    <span className="inline-flex items-center gap-1.5" title={ETICHETTE_STATO[stato]}>
      {/* `role="img"`: su un elemento generico l'`aria-label` non viene letto,
          e lo stato resterebbe un quadratino colorato e muto. */}
      <span
        role="img"
        className={cn('inline-flex h-6 w-8 items-center justify-center rounded-md', classe)}
        aria-label={ETICHETTE_STATO[stato]}
      >
        <Icona className="h-3.5 w-3.5" aria-hidden />
      </span>
      {/* Il residuo si scrive solo se c'è: nella legenda l'icona compare a
          residuo zero, e «0,00 €» accanto a «Parzialmente abbinato» è rumore. */}
      {stato === 'parziale' && residuo > 0 && (
        <span className="text-xs text-orange-600">{formatCurrency(residuo)}</span>
      )}
    </span>
  )
}
