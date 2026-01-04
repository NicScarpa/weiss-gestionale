'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  parseISO,
  isToday,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ShiftAssignment {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  shiftDefinition?: {
    name: string
    code: string
    color: string
  } | null
  venue?: {
    name: string
    code: string
  } | null
}

async function fetchShifts(from: string, to: string): Promise<ShiftAssignment[]> {
  const res = await fetch(`/api/portal/shifts?from=${from}&to=${to}`)
  if (!res.ok) throw new Error('Errore nel caricamento turni')
  const data = await res.json()
  return data.data || []
}

function formatTime(timeStr: string): string {
  if (timeStr.includes('T')) {
    return format(parseISO(timeStr), 'HH:mm')
  }
  return timeStr.substring(0, 5)
}

export function ShiftCalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { locale: it })
  const calendarEnd = endOfWeek(monthEnd, { locale: it })

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['portal-shifts-calendar', format(monthStart, 'yyyy-MM-dd')],
    queryFn: () =>
      fetchShifts(
        format(calendarStart, 'yyyy-MM-dd'),
        format(calendarEnd, 'yyyy-MM-dd')
      ),
  })

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const goToToday = () => setCurrentMonth(new Date())

  // Crea array dei giorni del calendario
  const days: Date[] = []
  let day = calendarStart
  while (day <= calendarEnd) {
    days.push(day)
    day = addDays(day, 1)
  }

  // Raggruppa turni per data
  const shiftsByDate: Record<string, ShiftAssignment[]> = {}
  shifts?.forEach((shift) => {
    const dateKey = shift.date.split('T')[0]
    if (!shiftsByDate[dateKey]) {
      shiftsByDate[dateKey] = []
    }
    shiftsByDate[dateKey].push(shift)
  })

  return (
    <div className="space-y-4">
      {/* Header navigazione */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: it })}
          </h2>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            Oggi
          </Button>
        </div>

        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Griglia calendario */}
      <Card>
        <CardContent className="p-0">
          {/* Header giorni settimana */}
          <div className="grid grid-cols-7 border-b">
            {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-medium text-slate-500"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Griglia giorni */}
          {isLoading ? (
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-[80px] border-b border-r p-1">
                  <Skeleton className="h-4 w-4 mb-2" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const dateKey = format(d, 'yyyy-MM-dd')
                const dayShifts = shiftsByDate[dateKey] || []
                const isCurrentMonth = isSameMonth(d, currentMonth)
                const isCurrentDay = isToday(d)

                return (
                  <div
                    key={dateKey}
                    className={cn(
                      'min-h-[80px] border-b border-r p-1',
                      !isCurrentMonth && 'bg-slate-50'
                    )}
                  >
                    <div
                      className={cn(
                        'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                        isCurrentDay && 'bg-amber-500 text-white',
                        !isCurrentMonth && 'text-slate-400'
                      )}
                    >
                      {format(d, 'd')}
                    </div>

                    {dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="text-xs p-1 rounded mb-0.5 truncate"
                        style={{
                          backgroundColor: shift.shiftDefinition?.color
                            ? `${shift.shiftDefinition.color}20`
                            : '#f1f5f9',
                          borderLeft: `3px solid ${
                            shift.shiftDefinition?.color || '#6B7280'
                          }`,
                        }}
                      >
                        <span className="font-medium">
                          {shift.shiftDefinition?.code || 'T'}
                        </span>{' '}
                        <span className="text-slate-600">
                          {formatTime(shift.startTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda turni */}
      {shifts && shifts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from(
            new Set(
              shifts
                .filter((s) => s.shiftDefinition)
                .map((s) => JSON.stringify(s.shiftDefinition))
            )
          ).map((sdStr) => {
            const sd = JSON.parse(sdStr)
            return (
              <Badge
                key={sd.code}
                variant="outline"
                style={{
                  borderColor: sd.color,
                  backgroundColor: `${sd.color}10`,
                }}
              >
                {sd.code} - {sd.name}
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
