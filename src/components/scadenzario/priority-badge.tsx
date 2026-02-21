import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SchedulePriority, SCHEDULE_PRIORITY_LABELS, SCHEDULE_PRIORITY_COLORS } from '@/types/schedule'
import { AlertCircle, ArrowDown, ArrowUp, Minus } from 'lucide-react'

interface PriorityBadgeProps {
  priorita: SchedulePriority
  showIcon?: boolean
  size?: 'sm' | 'default' | 'lg'
}

const PRIORITY_ICONS: Record<SchedulePriority, React.ElementType> = {
  bassa: ArrowDown,
  normale: Minus,
  alta: ArrowUp,
  urgente: AlertCircle,
}

export function PriorityBadge({
  priorita,
  showIcon = false,
  size: _size = 'sm',
}: PriorityBadgeProps) {
  const Icon = PRIORITY_ICONS[priorita]

  const badge = (
    <Badge className={SCHEDULE_PRIORITY_COLORS[priorita]} variant="secondary">
      {showIcon && <Icon className="mr-1 h-3 w-3" />}
      {SCHEDULE_PRIORITY_LABELS[priorita]}
    </Badge>
  )

  if (showIcon) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Priorità: {SCHEDULE_PRIORITY_LABELS[priorita]}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return badge
}
