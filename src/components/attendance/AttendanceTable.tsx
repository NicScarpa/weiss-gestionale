'use client'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, Coffee, Home, LogIn, Calendar } from 'lucide-react'
import { format } from 'date-fns'

interface AttendanceSummaryItem {
  assignment: {
    id: string
    user: {
      id: string
      firstName: string
      lastName: string
    }
    venue: {
      id: string
      name: string
      code: string
    }
    shiftDefinition: {
      name: string
      code: string
      color: string | null
    } | null
    scheduledStart: string
    scheduledEnd: string
    scheduledMinutes: number
  }
  attendance: {
    status: 'SCHEDULED' | 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' | 'ABSENT'
    clockIn: string | null
    clockOut: string | null
    breakStart: string | null
    breakEnd: string | null
    minutesWorked: number
    hoursWorked: number
    punchCount: number
  }
  hasAnomalies: boolean
  actualVsScheduled: {
    differenceMinutes: number
    percentageWorked: number
  }
}

interface AttendanceTableProps {
  data: AttendanceSummaryItem[]
  onManualEntry?: (userId: string) => void
}

const statusConfig = {
  SCHEDULED: {
    label: 'Schedulato',
    variant: 'secondary' as const,
    icon: Calendar,
  },
  CLOCKED_IN: {
    label: 'In servizio',
    variant: 'default' as const,
    icon: LogIn,
  },
  ON_BREAK: {
    label: 'In pausa',
    variant: 'outline' as const,
    icon: Coffee,
  },
  CLOCKED_OUT: {
    label: 'Uscito',
    variant: 'secondary' as const,
    icon: Home,
  },
  ABSENT: {
    label: 'Assente',
    variant: 'destructive' as const,
    icon: AlertTriangle,
  },
}

function formatTime(dateString: string | null): string {
  if (!dateString) return '--:--'
  return format(new Date(dateString), 'HH:mm')
}

function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

export function AttendanceTable({ data, onManualEntry }: AttendanceTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nessun turno schedulato per oggi</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dipendente</TableHead>
            <TableHead>Turno</TableHead>
            <TableHead>Orario Prev.</TableHead>
            <TableHead>Entrata</TableHead>
            <TableHead>Uscita</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Ore</TableHead>
            <TableHead className="text-right">Diff.</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => {
            const status = statusConfig[item.attendance.status]
            const StatusIcon = status.icon
            const diffMinutes = item.actualVsScheduled.differenceMinutes

            return (
              <TableRow key={item.assignment.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>
                      {item.assignment.user.firstName} {item.assignment.user.lastName}
                    </span>
                    {item.hasAnomalies && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {item.assignment.shiftDefinition ? (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: item.assignment.shiftDefinition.color || undefined,
                        backgroundColor: item.assignment.shiftDefinition.color
                          ? `${item.assignment.shiftDefinition.color}20`
                          : undefined,
                      }}
                    >
                      {item.assignment.shiftDefinition.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatTime(item.assignment.scheduledStart)} -{' '}
                  {formatTime(item.assignment.scheduledEnd)}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      item.attendance.clockIn ? 'text-green-600' : 'text-muted-foreground'
                    }
                  >
                    {formatTime(item.attendance.clockIn)}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={
                      item.attendance.clockOut ? 'text-blue-600' : 'text-muted-foreground'
                    }
                  >
                    {formatTime(item.attendance.clockOut)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant} className="gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {item.attendance.hoursWorked.toFixed(1)}h
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span
                    className={
                      diffMinutes > 0
                        ? 'text-green-600'
                        : diffMinutes < 0
                          ? 'text-red-600'
                          : ''
                    }
                  >
                    {diffMinutes > 0 ? '+' : ''}
                    {formatMinutesToHours(diffMinutes)}
                  </span>
                </TableCell>
                <TableCell>
                  {onManualEntry && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onManualEntry(item.assignment.user.id)}
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
