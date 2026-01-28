'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  GeolocationPosition,
  GeolocationError,
  GeolocationState,
  VenueLocation,
  DistanceCheckResult,
  UseGeolocationOptions,
  DEFAULT_GEOLOCATION_OPTIONS,
} from './types'
import { calculateDistance, isWithinRadius, formatDistance } from './haversine'

// Re-export utilities
export { calculateDistance, isWithinRadius, formatDistance } from './haversine'
export * from './types'

/**
 * Check if Geolocation API is supported in the browser
 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/**
 * Get current position as a Promise
 */
export function getCurrentPosition(
  options: UseGeolocationOptions = DEFAULT_GEOLOCATION_OPTIONS
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject({
        code: 'NOT_SUPPORTED',
        message: 'Geolocation is not supported by this browser',
      } as GeolocationError)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        })
      },
      (error) => {
        let code: GeolocationError['code']
        switch (error.code) {
          case error.PERMISSION_DENIED:
            code = 'PERMISSION_DENIED'
            break
          case error.POSITION_UNAVAILABLE:
            code = 'POSITION_UNAVAILABLE'
            break
          case error.TIMEOUT:
            code = 'TIMEOUT'
            break
          default:
            code = 'POSITION_UNAVAILABLE'
        }
        reject({
          code,
          message: error.message || getErrorMessage(code),
        } as GeolocationError)
      },
      {
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge,
      }
    )
  })
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(code: GeolocationError['code']): string {
  switch (code) {
    case 'PERMISSION_DENIED':
      return 'Permesso di geolocalizzazione negato. Abilita la posizione nelle impostazioni.'
    case 'POSITION_UNAVAILABLE':
      return 'Posizione non disponibile. Verifica che il GPS sia attivo.'
    case 'TIMEOUT':
      return 'Timeout nel recupero della posizione. Riprova.'
    case 'NOT_SUPPORTED':
      return 'Geolocalizzazione non supportata dal browser.'
    default:
      return 'Errore sconosciuto nella geolocalizzazione.'
  }
}

/**
 * React hook for geolocation with continuous watching
 */
export function useGeolocation(
  options: UseGeolocationOptions = DEFAULT_GEOLOCATION_OPTIONS
): GeolocationState & {
  refresh: () => void
} {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    isLoading: true,
    isSupported: isGeolocationSupported(),
  })

  const updatePosition = useCallback(() => {
    if (!isGeolocationSupported()) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isSupported: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: getErrorMessage('NOT_SUPPORTED'),
        },
      }))
      return
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    getCurrentPosition(options)
      .then((position) => {
        setState({
          position,
          error: null,
          isLoading: false,
          isSupported: true,
        })
      })
      .catch((error: GeolocationError) => {
        setState((prev) => ({
          ...prev,
          error,
          isLoading: false,
        }))
      })
  }, [options])

  useEffect(() => {
    if (!isGeolocationSupported()) {
      return
    }

    let cancelled = false

    getCurrentPosition(options)
      .then((position) => {
        if (!cancelled) {
          setState({
            position,
            error: null,
            isLoading: false,
            isSupported: true,
          })
        }
      })
      .catch((error: GeolocationError) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error,
            isLoading: false,
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [options])

  return {
    ...state,
    refresh: updatePosition,
  }
}

/**
 * React hook for checking distance from a venue
 */
export function useVenueDistance(
  venue: VenueLocation | null,
  options: UseGeolocationOptions = DEFAULT_GEOLOCATION_OPTIONS
): {
  distanceCheck: DistanceCheckResult | null
  isLoading: boolean
  error: GeolocationError | null
  refresh: () => void
} {
  const geo = useGeolocation(options)

  const distanceCheck: DistanceCheckResult | null =
    geo.position && venue
      ? {
          distanceMeters: Math.round(
            calculateDistance(
              geo.position.latitude,
              geo.position.longitude,
              venue.latitude,
              venue.longitude
            )
          ),
          isWithinRadius: isWithinRadius(
            geo.position.latitude,
            geo.position.longitude,
            venue.latitude,
            venue.longitude,
            venue.geoFenceRadius
          ).isWithin,
          venue,
          userPosition: geo.position,
        }
      : null

  return {
    distanceCheck,
    isLoading: geo.isLoading,
    error: geo.error,
    refresh: geo.refresh,
  }
}

/**
 * Check if user is within venue radius (one-time check)
 */
export async function checkVenueDistance(
  venue: VenueLocation,
  options: UseGeolocationOptions = DEFAULT_GEOLOCATION_OPTIONS
): Promise<DistanceCheckResult> {
  const position = await getCurrentPosition(options)

  const distance = calculateDistance(
    position.latitude,
    position.longitude,
    venue.latitude,
    venue.longitude
  )

  return {
    distanceMeters: Math.round(distance),
    isWithinRadius: distance <= venue.geoFenceRadius,
    venue,
    userPosition: position,
  }
}
