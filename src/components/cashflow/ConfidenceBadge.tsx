import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ConfidenceLevel, CONFIDENCE_LABELS } from '@/types/cash-flow'

/**
 * Quanto è affidabile una riga di previsione.
 *
 * Il componente era scritto con un'indicizzazione doppia — `config[level]` dove
 * `config` era già `{...}[level]` — quindi al primo utilizzo sarebbe andato in
 * `TypeError: Cannot read properties of undefined`. Non se n'era accorto nessuno
 * perché nessuna schermata lo montava: ora lo usa il dettaglio delle previsioni.
 */

const COLORE: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.CERTA]: 'bg-green-100 text-green-700',
  [ConfidenceLevel.ALTA]: 'bg-blue-100 text-blue-700',
  [ConfidenceLevel.MEDIA]: 'bg-amber-100 text-amber-700',
  [ConfidenceLevel.BASSA]: 'bg-red-100 text-red-700',
}

interface ConfidenceBadgeProps {
  level: ConfidenceLevel
  className?: string
}

export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  return (
    <Badge className={cn('text-xs', COLORE[level], className)}>
      {CONFIDENCE_LABELS[level]}
    </Badge>
  )
}
