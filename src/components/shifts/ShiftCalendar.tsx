'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { it } from 'date-fns/locale'

interface ShiftDefinition {
  id: string
  name: string
  code: string
  color: string | null
  startTime: string
  endTime: string
}

interface Assignment {
  id: string
  userId: string
  shiftDefinitionId: string | null
  date: string
  startTime: string
  endTime: string
  user: {
    id: string
    firstName: string
    lastName: string
  }
  shiftDefinition?: ShiftDefinition | null
}

interface ShiftCalendarProps {
  startDate: Date
  endDate: Date
  assignments: Assignment[]
  shiftDefinitions: ShiftDefinition[]
  onAssignmentClick?: (assignment: Assignment) => void
  onSlotClick?: (date: Date, shiftDefId: string) => void
}

export function ShiftCalendar({
  startDate,
  endDate,
  assignments,
  shiftDefinitions,
  onAssignmentClick,
  onSlotClick,
}: ShiftCalendarProps) {
  // Generate array of dates
  const dates = useMemo(() => {
    const result: Date[] = []
    let current = new Date(startDate)
    while (current <= endDate) {
      result.push(new Date(current))
      current = addDays(current, 1)
    }
    return result
  }, [startDate, endDate])

  // Group assignments by date and shift
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment[]>()

    for (const assignment of assignments) {
      const date = new Date(assignment.date).toDateString()
      const shiftId = assignment.shiftDefinitionId || 'custom'
      const key = `${date}_${shiftId}`

      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(assignment)
    }

    return map
  }, [assignments])

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const isToday = (date: Date) => {
    return isSameDay(date, new Date())
  }

  const isWeekend = (date: Date) => {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header row with dates */}
        <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `120px repeat(${dates.length}, 1fr)` }}>
          <div className="font-medium text-sm text-muted-foreground p-2">
            Turno
          </div>
          {dates.map(date => (
            <div
              key={date.toISOString()}
              className={cn(
                'text-center p-2 rounded-lg',
                isToday(date) && 'bg-primary text-primary-foreground',
                isWeekend(date) && !isToday(date) && 'bg-muted'
              )}
            >
              <div className="text-xs text-muted-foreground">
                {format(date, 'EEE', { locale: it })}
              </div>
              <div className="font-medium">
                {format(date, 'd')}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(date, 'MMM', { locale: it })}
              </div>
            </div>
          ))}
        </div>

        {/* Shift rows */}
        {shiftDefinitions.map(shift => (
          <div
            key={shift.id}
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: `120px repeat(${dates.length}, 1fr)` }}
          >
            {/* Shift label */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: shift.color || '#6B7280' }}
              />
              <div>
                <div className="font-medium text-sm">{shift.name}</div>
                <div className="text-xs text-muted-foreground">
                  {shift.startTime} - {shift.endTime}
                </div>
              </div>
            </div>

            {/* Day cells */}
            {dates.map(date => {
              const key = `${date.toDateString()}_${shift.id}`
              const dayAssignments = assignmentMap.get(key) || []

              return (
                <Card
                  key={key}
                  className={cn(
                    'min-h-[80px] p-1 cursor-pointer transition-colors',
                    'hover:border-primary/50',
                    isWeekend(date) && 'bg-muted/50'
                  )}
                  onClick={() => onSlotClick?.(date, shift.id)}
                >
                  {dayAssignments.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                      +
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {dayAssignments.map(assignment => (
                        <div
                          key={assignment.id}
                          className={cn(
                            'flex items-center gap-1 p-1 rounded text-xs cursor-pointer',
                            'bg-primary/10 hover:bg-primary/20'
                          )}
                          style={{
                            borderLeft: `3px solid ${shift.color || '#6B7280'}`,
                          }}
                          onClick={e => {
                            e.stopPropagation()
                            onAssignmentClick?.(assignment)
                          }}
                        >
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(assignment.user.firstName, assignment.user.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">
                            {assignment.user.firstName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        ))}

        {/* Custom assignments (without shift definition) */}
        {assignments.some(a => !a.shiftDefinitionId) && (
          <div
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: `120px repeat(${dates.length}, 1fr)` }}
          >
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <div>
                <div className="font-medium text-sm">Personalizzato</div>
                <div className="text-xs text-muted-foreground">
                  Orari custom
                </div>
              </div>
            </div>

            {dates.map(date => {
              const key = `${date.toDateString()}_custom`
              const dayAssignments = assignments.filter(
                a =>
                  !a.shiftDefinitionId &&
                  new Date(a.date).toDateString() === date.toDateString()
              )

              return (
                <Card
                  key={key}
                  className={cn(
                    'min-h-[80px] p-1',
                    isWeekend(date) && 'bg-muted/50'
                  )}
                >
                  {dayAssignments.length === 0 ? (
                    <div className="h-full" />
                  ) : (
                    <div className="space-y-1">
                      {dayAssignments.map(assignment => (
                        <div
                          key={assignment.id}
                          className="flex items-center gap-1 p-1 rounded text-xs bg-gray-100 cursor-pointer hover:bg-gray-200"
                          onClick={() => onAssignmentClick?.(assignment)}
                        >
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(assignment.user.firstName, assignment.user.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{assignment.user.firstName}</div>
                            <div className="text-muted-foreground">
                              {assignment.startTime}-{assignment.endTime}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
