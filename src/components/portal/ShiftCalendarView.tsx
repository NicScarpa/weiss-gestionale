'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
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
  parseISO,
  isToday,
  isBefore,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ShiftSwapDialog } from '@/components/portal/ShiftSwapDialog'

interface ShiftAssignment {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  swapStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  shiftDefinition?: {
    name: string
    code: string
    color: string
  } | null
  venue?: {
    id: string
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
  const [selectedShift, setSelectedShift] = useState<ShiftAssignment | null>(null)
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const { data: session } = useSession()

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
          <h2 className="text-lg font-bold text-gray-900 capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: it })}
          </h2>
          <Button variant="outline" size="sm" onClick={goToToday} className="border-green-200 text-green-600 hover:bg-green-50">
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
          <div className="grid grid-cols-7 border-b border-gray-100">
            {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-medium text-gray-400 uppercase"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Griglia giorni */}
          {isLoading ? (
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-[80px] border-b border-r border-gray-100 p-1">
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
                      'min-h-[80px] border-b border-r border-gray-100 p-1',
                      !isCurrentMonth && 'bg-gray-50/50'
                    )}
                  >
                    <div
                      className={cn(
                        'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                        isCurrentDay && 'bg-green-500 text-white',
                        !isCurrentMonth && 'text-gray-300'
                      )}
                    >
                      {format(d, 'd')}
                    </div>

                    {dayShifts.map((shift) => {
                      const shiftDate = parseISO(shift.date)
                      const isPast = isBefore(shiftDate, new Date())
                      const canSwap = !isPast && shift.status !== 'SWAPPED' && !shift.swapStatus

                      return (
                        <button
                          key={shift.id}
                          onClick={() => {
                            if (canSwap) {
                              setSelectedShift(shift)
                              setSwapDialogOpen(true)
                            }
                          }}
                          disabled={!canSwap}
                          className={cn(
                            "w-full text-left text-xs p-1 rounded mb-0.5 truncate transition-all",
                            canSwap && "hover:ring-2 hover:ring-green-400 cursor-pointer",
                            !canSwap && "opacity-60 cursor-not-allowed",
                            shift.swapStatus === 'PENDING' && "ring-2 ring-green-300"
                          )}
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
                          <span className="text-gray-600">
                            {formatTime(shift.startTime)}
                          </span>
                          {shift.swapStatus === 'PENDING' && (
                            <ArrowLeftRight className="inline-block w-3 h-3 ml-1 text-green-500" />
                          )}
                        </button>
                      )
                    })}
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

      {/* Hint per lo scambio */}
      <p className="text-xs text-gray-400 text-center">
        Clicca su un turno futuro per richiedere uno scambio
      </p>

      {/* Dialog scambio turno */}
      {session?.user && (
        <ShiftSwapDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          shift={selectedShift}
          currentUserId={session.user.id}
        />
      )}
    </div>
  )
}
