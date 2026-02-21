"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface CalendarEvent {
  id: string
  title: string
  date: string
  amount: number
  tipo: string
  stato: string
  priorita: string
  isRicorrente: boolean
}

interface ScheduleCalendarProps {
  events: Record<string, CalendarEvent[]>
  month: number
  year: number
  onNavigate: (direction: 'prev' | 'next') => void
  onDayClick?: (events: CalendarEvent[]) => void
}

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export function ScheduleCalendar({
  events,
  month,
  year,
  onNavigate,
  onDayClick,
}: ScheduleCalendarProps) {
  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === year &&
    today.getMonth() + 1 === month &&
    today.getDate() === day

  // Calculate grid
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const lastDayOfMonth = new Date(year, month, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  // getDay: 0=Sun, 1=Mon... convert to Mon=0
  let startDay = firstDayOfMonth.getDay() - 1
  if (startDay < 0) startDay = 6

  const days: (number | null)[] = []
  for (let i = 0; i < startDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  // Fill remaining cells to complete the grid row
  while (days.length % 7 !== 0) days.push(null)

  const getEventsForDay = (day: number): CalendarEvent[] => {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events[dateKey] || []
  }

  const totalEvents = Object.values(events).reduce((acc, evts) => acc + evts.length, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Vista Calendario</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => onNavigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Button variant="ghost" size="icon" onClick={() => onNavigate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {totalEvents === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <CalendarDays className="h-10 w-10 opacity-30" />
            <p className="font-medium">Nessuna scadenza in questo mese</p>
            <p className="text-sm">Naviga verso un altro mese o crea una nuova scadenza</p>
          </div>
        ) : null}

        {/* Grid always shown even with no events */}
        <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
          {/* Weekday headers */}
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="bg-background text-center text-xs font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}

          {/* Day cells */}
          {days.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="bg-background min-h-[80px]" />
            }

            const dayEvents = getEventsForDay(day)
            const displayEvents = dayEvents.slice(0, 3)
            const remaining = dayEvents.length - 3

            return (
              <div
                key={day}
                className={cn(
                  'bg-background min-h-[80px] p-1.5 relative',
                  isToday(day) && 'ring-2 ring-primary ring-inset',
                  dayEvents.length > 0 && 'cursor-pointer hover:bg-muted/50',
                )}
                onClick={() => dayEvents.length > 0 && onDayClick?.(dayEvents)}
              >
                <span className={cn(
                  'text-xs font-medium',
                  isToday(day) && 'text-primary font-bold',
                )}>
                  {day}
                </span>
                <div className="mt-1 space-y-0.5">
                  {displayEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className={cn(
                        'text-[10px] leading-tight px-1 py-0.5 rounded truncate',
                        evt.tipo === 'attiva'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700',
                      )}
                      title={`${evt.title} - ${formatCurrency(evt.amount)}`}
                    >
                      {formatCurrency(evt.amount)}
                    </div>
                  ))}
                  {remaining > 0 && (
                    <div className="text-[10px] text-muted-foreground text-center">
                      +{remaining}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
