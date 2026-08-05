'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LocationStatus } from '@/components/portal/LocationStatus'
import { PunchStatus, AttendanceStatus } from '@/components/portal/PunchStatus'
import {
  PunchButton,
  BreakButton,
  type PunchVenue,
} from '@/components/portal/PunchButton'
import { TodayPunches } from '@/components/portal/TodayPunches'
import { VenueLocation } from '@/lib/geolocation'
import type { AssignedLocation } from '@/lib/attendance/work-location'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Calendar, Clock, MapPin } from 'lucide-react'

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
  /**
   * Luoghi di lavoro su cui il dipendente è abilitato. Il server misura la
   * distanza da qui, non dalle coordinate della sede: il portale deve usare lo
   * stesso riferimento per non mostrare un semaforo verde su una timbratura
   * che nascerà fuori sede.
   */
  workLocations: AssignedLocation[]
  hoursWorkedToday: number
  punchCount: number
}

interface VenuesResponse {
  venues: Array<{
    id: string
    name: string
    code: string
    latitude: string | null
    longitude: string | null
  }>
}

const SELECTED_VENUE_STORAGE_KEY = 'portale-timbra-venue'

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

  const todayAssignment = statusData?.todayAssignment ?? null
  const luoghiAssegnati = statusData?.workLocations ?? []
  const needsVenueChoice = !isLoadingStatus && !todayAssignment

  // Senza turno pubblicato il dipendente sceglie la sede: chi viene chiamato
  // all'ultimo momento deve poter timbrare lo stesso.
  const { data: venuesData, isLoading: isLoadingVenues } =
    useQuery<VenuesResponse>({
      queryKey: ['portal-venues'],
      queryFn: async () => {
        const res = await fetch('/api/venues')
        if (!res.ok) throw new Error('Errore nel caricamento delle sedi')
        return res.json()
      },
      enabled: needsVenueChoice,
      staleTime: 5 * 60 * 1000,
    })

  const availableVenues = venuesData?.venues ?? []

  // Preseleziona l'ultima sede usata sul dispositivo
  const [venueChoice, setVenueChoice] = useState<string | null>(() =>
    typeof window !== 'undefined'
      ? window.localStorage.getItem(SELECTED_VENUE_STORAGE_KEY)
      : null
  )

  const handleVenueChange = (venueId: string) => {
    setVenueChoice(venueId)
    window.localStorage.setItem(SELECTED_VENUE_STORAGE_KEY, venueId)
  }

  // Con una sola sede attiva la scelta è implicita
  const selectedVenueId =
    venueChoice && availableVenues.some((v) => v.id === venueChoice)
      ? venueChoice
      : availableVenues.length === 1
        ? availableVenues[0].id
        : null

  const selectedVenue =
    availableVenues.find((v) => v.id === selectedVenueId) ?? null

  // Sede su cui timbrare: quella del turno oppure quella scelta manualmente
  const punchVenue: PunchVenue | null = todayAssignment
    ? {
        id: todayAssignment.venue.id,
        name: todayAssignment.venue.name,
        latitude: todayAssignment.venue.latitude
          ? parseFloat(todayAssignment.venue.latitude)
          : null,
        longitude: todayAssignment.venue.longitude
          ? parseFloat(todayAssignment.venue.longitude)
          : null,
        geoFenceRadius:
          todayAssignment.venue.attendancePolicy?.geoFenceRadius ?? 100,
      }
    : selectedVenue
      ? {
          id: selectedVenue.id,
          name: selectedVenue.name,
          latitude: selectedVenue.latitude
            ? parseFloat(selectedVenue.latitude)
            : null,
          longitude: selectedVenue.longitude
            ? parseFloat(selectedVenue.longitude)
            : null,
        }
      : null

  // Il controllo distanza sulla sede vale solo per chi non ha luoghi di lavoro
  // assegnati, e solo se la sede ha le coordinate.
  const venue: VenueLocation | null =
    luoghiAssegnati.length === 0 &&
    punchVenue &&
    punchVenue.latitude !== null &&
    punchVenue.latitude !== undefined &&
    punchVenue.longitude !== null &&
    punchVenue.longitude !== undefined
      ? {
          id: punchVenue.id,
          name: punchVenue.name,
          latitude: punchVenue.latitude,
          longitude: punchVenue.longitude,
          geoFenceRadius: punchVenue.geoFenceRadius ?? 100,
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
      <LocationStatus venue={venue} workLocations={luoghiAssegnati} />

      {/* Turno di oggi (se presente) */}
      {todayAssignment && (
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

      {/* Se non c'è turno oggi: scelta manuale della sede */}
      {!todayAssignment && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Sede
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nessun turno programmato per oggi. Scegli la sede in cui stai
              lavorando per poter timbrare.
            </p>

            {isLoadingVenues ? (
              <Skeleton className="h-10 w-full" />
            ) : availableVenues.length === 0 ? (
              <p className="text-sm text-destructive">
                Nessuna sede disponibile. Contatta un responsabile.
              </p>
            ) : (
              <Select
                value={selectedVenueId ?? undefined}
                onValueChange={handleVenueChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona la sede" />
                </SelectTrigger>
                <SelectContent>
                  {availableVenues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
      <PunchButton
        status={status}
        venue={punchVenue}
        workLocations={luoghiAssegnati}
      />

      {/* Pulsante pausa (solo se in servizio) */}
      {status === 'CLOCKED_IN' && (
        <div className="flex gap-2">
          <BreakButton venue={punchVenue} className="flex-1" />
        </div>
      )}

      {/* Lista timbrature di oggi */}
      <TodayPunches venueId={punchVenue?.id} />
    </div>
  )
}
