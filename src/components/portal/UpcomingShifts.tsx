'use client'

import { useQuery } from '@tanstack/react-query'
import { format, parseISO, isToday, isTomorrow } from 'date-fns'
import { it } from 'date-fns/locale'
import { Clock, MapPin, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface ShiftAssignment {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  workStation: string | null
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

async function fetchUpcomingShifts(): Promise<ShiftAssignment[]> {
  const today = new Date().toISOString().split('T')[0]
  const res = await fetch(`/api/portal/shifts?from=${today}&limit=5`)
  if (!res.ok) throw new Error('Errore nel caricamento turni')
  const data = await res.json()
  return data.data || []
}

function formatShiftDate(dateStr: string): string {
  const date = parseISO(dateStr)
  if (isToday(date)) return 'Oggi'
  if (isTomorrow(date)) return 'Domani'
  return format(date, 'EEEE d MMMM', { locale: it })
}

function formatTime(timeStr: string): string {
  // Il timeStr potrebbe essere ISO o solo HH:MM
  if (timeStr.includes('T')) {
    return format(parseISO(timeStr), 'HH:mm')
  }
  return timeStr.substring(0, 5)
}

export function UpcomingShifts() {
  const { data: shifts, isLoading, error } = useQuery({
    queryKey: ['portal-upcoming-shifts'],
    queryFn: fetchUpcomingShifts,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-portal-primary" />
            Prossimi Turni
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-portal-primary" />
            Prossimi Turni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">
            Errore nel caricamento dei turni
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5 text-portal-primary" />
          Prossimi Turni
        </CardTitle>
      </CardHeader>
      <CardContent>
        {shifts && shifts.length > 0 ? (
          <div className="space-y-3">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white"
              >
                {/* Indicatore colore turno */}
                <div
                  className="w-1 h-12 rounded-full"
                  style={{
                    backgroundColor: shift.shiftDefinition?.color || '#6B7280',
                  }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {formatShiftDate(shift.date)}
                    </span>
                    {shift.shiftDefinition && (
                      <Badge variant="secondary" className="text-xs">
                        {shift.shiftDefinition.name}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                    </span>
                    {shift.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {shift.venue.code}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            Nessun turno programmato
          </p>
        )}
      </CardContent>
    </Card>
  )
}
