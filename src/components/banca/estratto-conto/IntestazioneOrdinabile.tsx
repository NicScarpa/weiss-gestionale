import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import type { OrdinaPer } from '@/lib/banca/filtri-estratto-conto'
import { cn } from '@/lib/utils'

interface Props {
  etichetta: string
  ordina?: OrdinaPer
  attivo: OrdinaPer
  verso: 'asc' | 'desc'
  aDestra?: boolean
  onOrdina: (campo: OrdinaPer) => void
}

/**
 * L'affordance è sempre visibile — la doppia freccia grigia dice «questa
 * colonna si ordina» anche prima del passaggio del mouse — e gli stati sono
 * due soli: crescente e decrescente. Il terzo stato «nessun ordinamento»
 * rovescerebbe la lista sotto le mani di chi legge.
 */
export function IntestazioneOrdinabile({ etichetta, ordina, attivo, verso, aDestra, onOrdina }: Props) {
  const eAttiva = ordina !== undefined && ordina === attivo
  return (
    <th
      className={cn('h-10 px-3 text-left text-sm font-medium', aDestra && 'text-right')}
      aria-sort={eAttiva ? (verso === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {ordina ? (
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
            aDestra && 'flex-row-reverse'
          )}
          onClick={() => onOrdina(ordina)}
        >
          {etichetta}
          {eAttiva ? (
            verso === 'asc' ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
          )}
        </button>
      ) : (
        etichetta
      )}
    </th>
  )
}
