'use client'

import { useVenueDistance, formatDistance, VenueLocation } from '@/lib/geolocation'
import { MapPin, MapPinOff, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LocationStatusProps {
  venue: VenueLocation | null
  className?: string
}

export function LocationStatus({ venue, className }: LocationStatusProps) {
  const { distanceCheck, isLoading, error, refresh } = useVenueDistance(venue)

  if (!venue) {
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

  if (!distanceCheck) {
    return null
  }

  const { distanceMeters, isWithinRadius } = distanceCheck

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm',
        isWithinRadius
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        <span>
          {venue.name} ({formatDistance(distanceMeters)})
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
