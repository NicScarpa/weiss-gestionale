'use client'

import { useGeolocation, calculateDistance, formatDistance, VenueLocation } from '@/lib/geolocation'
import {
  pickWorkLocation,
  type AssignedLocation,
} from '@/lib/attendance/work-location'
import { MapPin, MapPinOff, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LocationStatusProps {
  venue: VenueLocation | null
  /**
   * Luoghi di lavoro su cui la persona è abilitata. Se ce n'è almeno uno la
   * distanza si misura dal più vicino, con il suo raggio: è lo stesso criterio
   * con cui il server decide dove collocare la timbratura, e senza di esso il
   * semaforo direbbe "nel raggio" mentre la timbratura nasce fuori sede.
   */
  workLocations?: AssignedLocation[]
  className?: string
}

/** Quello da cui si sta misurando la distanza, luogo di lavoro o sede. */
interface Riferimento {
  name: string
  distanceMeters: number | null
  isWithinRadius: boolean
}

export function LocationStatus({
  venue,
  workLocations = [],
  className,
}: LocationStatusProps) {
  const { position, isLoading, error, refresh } = useGeolocation()

  const coordinate = position
    ? { latitude: position.latitude, longitude: position.longitude }
    : null

  let riferimento: Riferimento | null = null

  if (workLocations.length > 0) {
    const scelta = pickWorkLocation(workLocations, coordinate)
    riferimento = scelta.location
      ? {
          name: scelta.location.name,
          distanceMeters: scelta.distanceMeters,
          isWithinRadius: scelta.isWithinRadius,
        }
      : null
  } else if (venue && coordinate) {
    const distanceMeters = Math.round(
      calculateDistance(
        coordinate.latitude,
        coordinate.longitude,
        venue.latitude,
        venue.longitude
      )
    )
    riferimento = {
      name: venue.name,
      distanceMeters,
      isWithinRadius: distanceMeters <= venue.geoFenceRadius,
    }
  }

  if (!venue && workLocations.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm',
          className
        )}
      >
        <MapPinOff className="h-4 w-4" />
        <span>Sede non configurata</span>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm',
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Rilevamento posizione...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm',
          className
        )}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="truncate">{error.message}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          className="h-6 w-6 p-0"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  // Più luoghi assegnati e nessuno con le coordinate: non si può dire dove si
  // sta timbrando, ed è la stessa cosa che risponderà il server.
  if (!riferimento) {
    if (workLocations.length === 0) return null

    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm',
          className
        )}
      >
        <MapPinOff className="h-4 w-4" />
        <span>Non riesco a stabilire in quale luogo ti trovi</span>
      </div>
    )
  }

  const { name, distanceMeters, isWithinRadius } = riferimento

  // Luogo senza coordinate: non c'è un raggio da rispettare, quindi nemmeno un
  // "fuori sede" da segnalare.
  if (distanceMeters === null) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm',
          className
        )}
      >
        <MapPin className="h-4 w-4" />
        <span>{name} · nessun raggio configurato</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm',
        isWithinRadius
          ? 'bg-green-50 text-green-600 border border-green-200'
          : 'bg-amber-50 text-amber-600 border border-amber-200',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        <span>
          {name} ({formatDistance(distanceMeters)})
        </span>
        {isWithinRadius ? (
          <span className="text-xs font-medium">Nel raggio</span>
        ) : (
          <span className="text-xs font-medium">Fuori sede</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={refresh}
        className="h-6 w-6 p-0 hover:bg-white/50"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  )
}
