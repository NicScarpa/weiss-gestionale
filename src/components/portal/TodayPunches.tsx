'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LogIn, LogOut, Coffee, MapPin, MapPinOff } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { formatDistance } from '@/lib/geolocation'

interface TodayPunch {
  id: string
  type: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'
  method: string
  time: string
  venue: {
    id: string
    name: string
    code: string
  }
  isWithinRadius: boolean
  distanceFromVenue: number | null
  notes: string | null
  isManual: boolean
}

interface TodayPunchesProps {
  venueId?: string
  className?: string
}

const punchTypeConfig: Record<
  TodayPunch['type'],
  { label: string; icon: React.ElementType; color: string }
> = {
  IN: {
    label: 'Entrata',
    icon: LogIn,
    color: 'text-green-600',
  },
  OUT: {
    label: 'Uscita',
    icon: LogOut,
    color: 'text-red-600',
  },
  BREAK_START: {
    label: 'Inizio pausa',
    icon: Coffee,
    color: 'text-amber-600',
  },
  BREAK_END: {
    label: 'Fine pausa',
    icon: Coffee,
    color: 'text-amber-600',
  },
}

export function TodayPunches({ venueId, className }: TodayPunchesProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance-today', venueId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)

      const res = await fetch(`/api/attendance/today?${params}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json()
    },
    refetchInterval: 30000, // Aggiorna ogni 30 secondi
  })

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Timbrature Oggi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Timbrature Oggi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Errore nel caricamento delle timbrature
          </p>
        </CardContent>
      </Card>
    )
  }

  const punches: TodayPunch[] = data?.data || []
  const summary = data?.summary

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Timbrature Oggi</CardTitle>
          {summary && summary.netHoursWorked > 0 && (
            <span className="text-sm font-medium text-muted-foreground">
              {summary.netHoursWorked}h lavorate
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {punches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna timbratura oggi
          </p>
        ) : (
          <div className="space-y-2">
            {punches.map((punch) => {
              const config = punchTypeConfig[punch.type]
              const Icon = config.icon

              return (
                <div
                  key={punch.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-1.5 rounded-full bg-white shadow-sm',
                        config.color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{config.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {punch.venue.code}
                        {punch.isManual && ' (manuale)'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Indicatore posizione */}
                    {punch.distanceFromVenue !== null && (
                      <div
                        className={cn(
                          'flex items-center gap-1 text-xs',
                          punch.isWithinRadius
                            ? 'text-green-600'
                            : 'text-amber-600'
                        )}
                      >
                        {punch.isWithinRadius ? (
                          <MapPin className="h-3 w-3" />
                        ) : (
                          <MapPinOff className="h-3 w-3" />
                        )}
                        {formatDistance(punch.distanceFromVenue)}
                      </div>
                    )}

                    {/* Orario */}
                    <span className="font-mono font-medium">
                      {format(new Date(punch.time), 'HH:mm', { locale: it })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
