import { Badge } from '@/components/ui/badge'
import {
  ScheduleSource,
  SCHEDULE_SOURCE_LABELS,
  SCHEDULE_SOURCE_SHORT_LABELS,
} from '@/types/schedule'
import { FileSpreadsheet, FileText, PenLine, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const SOURCE_ICONS: Record<ScheduleSource, LucideIcon> = {
  [ScheduleSource.MANUALE]: PenLine,
  [ScheduleSource.IMPORT_CSV]: FileSpreadsheet,
  [ScheduleSource.IMPORT_FATTURE_SDI]: FileText,
  [ScheduleSource.RICORRENZA_AUTO]: Repeat,
}

interface ScheduleSourceBadgeProps {
  source: ScheduleSource | string
  /** In lista serve l'etichetta corta, nel dettaglio quella estesa */
  compact?: boolean
}

export function ScheduleSourceBadge({ source, compact = false }: ScheduleSourceBadgeProps) {
  const known = Object.values(ScheduleSource).includes(source as ScheduleSource)
    ? (source as ScheduleSource)
    : null

  if (!known) {
    return (
      <Badge variant="secondary" className="text-[10px] px-1 py-0">
        {source}
      </Badge>
    )
  }

  const Icon = SOURCE_ICONS[known]
  const label = compact ? SCHEDULE_SOURCE_SHORT_LABELS[known] : SCHEDULE_SOURCE_LABELS[known]

  return (
    <Badge
      variant="secondary"
      className={compact ? 'text-[10px] px-1 py-0' : ''}
      title={SCHEDULE_SOURCE_LABELS[known]}
    >
      <Icon className={compact ? 'h-2.5 w-2.5 mr-0.5' : 'h-3 w-3 mr-1'} />
      {label}
    </Badge>
  )
}
