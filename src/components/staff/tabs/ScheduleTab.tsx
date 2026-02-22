'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, getDay, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'

interface ScheduleTabProps {
  userId: string
}

export function ScheduleTab({ userId }: ScheduleTabProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const to = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['staff-shifts', userId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${userId}/shifts?from=${from}&to=${to}`)
      if (!res.ok) return { assignments: [] }
      return res.json()
    },
  })

  const assignments = data?.assignments || []

  // Group assignments by date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignmentsByDate = assignments.reduce((acc: Record<string, any[]>, a: any) => {
    const date = a.date.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(a)
    return acc
  }, {})

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  // Padding for first day of month
  const firstDayOfMonth = startOfMonth(currentMonth)
  const startDay = (getDay(firstDayOfMonth) + 6) % 7 // Monday = 0

  const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-40 text-center capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: it })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card>
          <CardContent className="p-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAY_HEADERS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for padding */}
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-20" />
              ))}

              {/* Day cells */}
              {days.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayAssignments = assignmentsByDate[dateKey] || []

                return (
                  <div
                    key={dateKey}
                    className={`h-20 border rounded-md p-1 text-xs ${
                      dayAssignments.length > 0 ? 'bg-background' : 'bg-muted/20'
                    }`}
                  >
                    <div className="font-medium text-muted-foreground mb-1">
                      {format(day, 'd')}
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {dayAssignments.map((a: any) => {
                      const startTime = a.startTime ? format(new Date(a.startTime), 'HH:mm') : ''
                      const endTime = a.endTime ? format(new Date(a.endTime), 'HH:mm') : ''
                      return (
                        <div
                          key={a.id}
                          className="rounded px-1 py-0.5 text-[10px] truncate"
                          style={{
                            backgroundColor: a.shiftDefinition?.color ? `${a.shiftDefinition.color}20` : 'hsl(var(--primary) / 0.1)',
                            color: a.shiftDefinition?.color || 'hsl(var(--primary))',
                          }}
                        >
                          {startTime}-{endTime}
                          {a.shiftDefinition?.code && ` ${a.shiftDefinition.code}`}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
