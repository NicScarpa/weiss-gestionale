import { Badge } from '@/components/ui/badge'
import { ScheduleStatus, SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/types/schedule'

interface ScheduleStatusBadgeProps {
  stato: ScheduleStatus
  showLabel?: boolean
  size?: 'sm' | 'default' | 'lg'
  /**
   * Giorni di ritardo, mostrati come suffisso. Portare l'anzianità dentro il
   * badge rende la lista scorribile per urgenza senza doverla ordinare, e
   * costa uno sguardo invece di un cambio di pagina.
   */
  giorniRitardo?: number
}

export function ScheduleStatusBadge({
  stato,
  showLabel = true,
  size: _size = 'default',
  giorniRitardo,
}: ScheduleStatusBadgeProps) {
  if (!showLabel) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${SCHEDULE_STATUS_COLORS[stato]}`}
        title={SCHEDULE_STATUS_LABELS[stato]}
      >
        <span className="w-2 h-2 rounded-full border-2 border-current opacity-50" />
      </span>
    )
  }

  const etichetta =
    giorniRitardo && giorniRitardo > 0
      ? `${SCHEDULE_STATUS_LABELS[stato]} +${giorniRitardo}g`
      : SCHEDULE_STATUS_LABELS[stato]

  return (
    <Badge className={SCHEDULE_STATUS_COLORS[stato]} variant="outline">
      {etichetta}
    </Badge>
  )
}
