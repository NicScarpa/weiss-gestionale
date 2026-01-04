'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LocationStatus } from '@/components/portal/LocationStatus'
import { PunchStatus, AttendanceStatus } from '@/components/portal/PunchStatus'
import { PunchButton, BreakButton } from '@/components/portal/PunchButton'
import { TodayPunches } from '@/components/portal/TodayPunches'
import { VenueLocation } from '@/lib/geolocation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Calendar, Clock } from 'lucide-react'

interface CurrentStatusResponse {
  status: AttendanceStatus
  clockInTime: string | null
  clockOutTime: string | null
  breakStartTime: string | null
  lastPunch: {
    type: string
    time: string
    venue: { id: string; name: string; code: string }
  } | null
  todayAssignment: {
    id: string
    startTime: string
    endTime: string
    shiftDefinition: {
      id: string
      name: string
      code: string
      color: string | null
    } | null
    venue: {
      id: string
      name: string
      code: string
      latitude: string | null
      longitude: string | null
      attendancePolicy: {
        geoFenceRadius: number
        requireGeolocation: boolean
        blockOutsideLocation: boolean
      } | null
    }
  } | null
  hoursWorkedToday: number
  punchCount: number
}

export default function TimbraPage() {
  const { data: statusData, isLoading: isLoadingStatus } =
    useQuery<CurrentStatusResponse>({
      queryKey: ['attendance-current'],
      queryFn: async () => {
        const res = await fetch('/api/attendance/current')
        if (!res.ok) throw new Error('Errore nel caricamento')
        return res.json()
      },
      refetchInterval: 10000, // Aggiorna ogni 10 secondi
    })

  // Costruisci l'oggetto venue per la geolocalizzazione
  const venue: VenueLocation | null =
    statusData?.todayAssignment?.venue &&
    statusData.todayAssignment.venue.latitude &&
    statusData.todayAssignment.venue.longitude
      ? {
          id: statusData.todayAssignment.venue.id,
          name: statusData.todayAssignment.venue.name,
          latitude: parseFloat(statusData.todayAssignment.venue.latitude),
          longitude: parseFloat(statusData.todayAssignment.venue.longitude),
          geoFenceRadius:
            statusData.todayAssignment.venue.attendancePolicy?.geoFenceRadius ??
            100,
        }
      : null

  const formatShiftTime = (timeStr: string) => {
    const date = new Date(timeStr)
    return format(date, 'HH:mm', { locale: it })
  }

  if (isLoadingStatus) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const status = statusData?.status ?? 'NOT_CLOCKED_IN'

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header con data */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          {format(new Date(), "EEEE d MMMM", { locale: it })}
        </h1>
        <p className="text-muted-foreground">
          {format(new Date(), 'yyyy', { locale: it })}
        </p>
      </div>

      {/* Location status */}
      <LocationStatus venue={venue} />

      {/* Turno di oggi (se presente) */}
      {statusData?.todayAssignment && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Turno Oggi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {statusData.todayAssignment.shiftDefinition && (
                  <div
                    className="w-3 h-10 rounded"
                    style={{
                      backgroundColor:
                        statusData.todayAssignment.shiftDefinition.color ??
                        '#6B7280',
                    }}
                  />
                )}
                <div>
                  <div className="font-medium">
                    {statusData.todayAssignment.shiftDefinition?.name ??
                      'Turno'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {statusData.todayAssignment.venue.name}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 font-mono font-medium">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {formatShiftTime(statusData.todayAssignment.startTime)} -{' '}
                  {formatShiftTime(statusData.todayAssignment.endTime)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Se non c'è turno oggi */}
      {!statusData?.todayAssignment && (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-muted-foreground">
              Nessun turno programmato per oggi
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stato attuale */}
      <PunchStatus
        status={status}
        clockInTime={
          statusData?.clockInTime ? new Date(statusData.clockInTime) : null
        }
        clockOutTime={
          statusData?.clockOutTime ? new Date(statusData.clockOutTime) : null
        }
        breakStartTime={
          statusData?.breakStartTime
            ? new Date(statusData.breakStartTime)
            : null
        }
        hoursWorkedToday={statusData?.hoursWorkedToday ?? 0}
      />

      {/* Pulsante principale timbratura */}
      <PunchButton status={status} venue={venue} />

      {/* Pulsante pausa (solo se in servizio) */}
      {status === 'CLOCKED_IN' && (
        <div className="flex gap-2">
          <BreakButton venue={venue} className="flex-1" />
        </div>
      )}

      {/* Lista timbrature di oggi */}
      <TodayPunches venueId={venue?.id} />
    </div>
  )
}
