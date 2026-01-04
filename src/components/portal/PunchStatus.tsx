'use client'

import { cn } from '@/lib/utils'
import { Clock, Coffee, LogIn, LogOut } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export type AttendanceStatus =
  | 'NOT_CLOCKED_IN'
  | 'CLOCKED_IN'
  | 'ON_BREAK'
  | 'CLOCKED_OUT'

interface PunchStatusProps {
  status: AttendanceStatus
  clockInTime?: Date | null
  clockOutTime?: Date | null
  breakStartTime?: Date | null
  hoursWorkedToday?: number
  className?: string
}

const statusConfig: Record<
  AttendanceStatus,
  {
    label: string
    icon: React.ElementType
    bgColor: string
    textColor: string
  }
> = {
  NOT_CLOCKED_IN: {
    label: 'Non timbrato',
    icon: LogIn,
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    textColor: 'text-slate-600 dark:text-slate-400',
  },
  CLOCKED_IN: {
    label: 'In servizio',
    icon: Clock,
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-700 dark:text-green-400',
  },
  ON_BREAK: {
    label: 'In pausa',
    icon: Coffee,
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  CLOCKED_OUT: {
    label: 'Turno terminato',
    icon: LogOut,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-400',
  },
}

export function PunchStatus({
  status,
  clockInTime,
  clockOutTime,
  breakStartTime,
  hoursWorkedToday = 0,
  className,
}: PunchStatusProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  const formatTime = (date: Date | null | undefined) => {
    if (!date) return '--:--'
    return format(new Date(date), 'HH:mm', { locale: it })
  }

  const formatHours = (hours: number) => {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Status badge */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-3 rounded-lg',
          config.bgColor,
          config.textColor
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="font-medium">{config.label}</span>
        {status === 'CLOCKED_IN' && hoursWorkedToday > 0 && (
          <span className="ml-auto text-sm opacity-75">
            {formatHours(hoursWorkedToday)}
          </span>
        )}
      </div>

      {/* Time details */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Entrata</div>
          <div className="font-mono font-medium">{formatTime(clockInTime)}</div>
        </div>
        <div className="p-2 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Pausa</div>
          <div className="font-mono font-medium">
            {formatTime(breakStartTime)}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Uscita</div>
          <div className="font-mono font-medium">{formatTime(clockOutTime)}</div>
        </div>
      </div>
    </div>
  )
}
