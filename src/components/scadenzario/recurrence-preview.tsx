import { Badge } from '@/components/ui/badge'
import { RecurrenceType, RECURRENCE_TYPE_LABELS } from '@/types/schedule'
import { RefreshCcw } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface RecurrencePreviewProps {
  isRicorrente: boolean
  ricorrenzaTipo: RecurrenceType | null
  ricorrenzaAttiva: boolean
  ricorrenzaProssimaGenerazione: Date | string | null
}

export function RecurrencePreview({
  isRicorrente,
  ricorrenzaTipo,
  ricorrenzaAttiva,
  ricorrenzaProssimaGenerazione,
}: RecurrencePreviewProps) {
  if (!isRicorrente || !ricorrenzaTipo) return null

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <RefreshCcw className="h-3 w-3" />
      <span>{RECURRENCE_TYPE_LABELS[ricorrenzaTipo]}</span>
      {!ricorrenzaAttiva && (
        <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-gray-100 text-gray-500">
          Disattivata
        </Badge>
      )}
      {ricorrenzaAttiva && ricorrenzaProssimaGenerazione && (
        <span className="text-muted-foreground">
          Prossima: {format(new Date(ricorrenzaProssimaGenerazione), 'dd/MM/yyyy', { locale: it })}
        </span>
      )}
    </div>
  )
}
