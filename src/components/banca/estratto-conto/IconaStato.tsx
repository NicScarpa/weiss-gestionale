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

export function IconaStato({ stato, residuo, proposta = false }: { stato: StatoLegenda; residuo: number; proposta?: boolean }) {
  const { Icona, classe } = STILE[stato]
  return (
    <span className="inline-flex items-center gap-1.5" title={ETICHETTE_STATO[stato]}>
      {/* Il puntino è FRATELLO del badge, non figlio: un `role="img"` dentro un
          altro `role="img"` non viene mai annunciato — il badge è già una
          foglia per il lettore di schermo — e «C'è una proposta da rivedere»
          andava perduta. Il contenitore relativo è questo, così il puntino
          resta all'angolo del badge e non dell'intera cella col residuo. */}
      <span className="relative inline-flex">
        {/* `role="img"`: su un elemento generico l'`aria-label` non viene letto,
            e lo stato resterebbe un quadratino colorato e muto. */}
        <span
          role="img"
          className={cn('inline-flex h-6 w-8 items-center justify-center rounded-md', classe)}
          aria-label={ETICHETTE_STATO[stato]}
        >
          <Icona className="h-3.5 w-3.5" aria-hidden />
        </span>
        {/* «C'è una proposta»: il puntino della spec sul Non abbinato (una
            proposta del motore da rivedere non è un abbinamento). */}
        {proposta && (
          <span
            role="img"
            aria-label="C'è una proposta da rivedere"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-amber-500"
          />
        )}
      </span>
      {/* Il residuo si scrive solo se c'è: nella legenda l'icona compare a
          residuo zero, e «0,00 €» accanto a «Parzialmente abbinato» è rumore. */}
      {stato === 'parziale' && residuo > 0 && (
        <span className="text-xs text-orange-600">{formatCurrency(residuo)}</span>
      )}
    </span>
  )
}
