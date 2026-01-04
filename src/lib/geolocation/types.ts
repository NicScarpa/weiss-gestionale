// Types for Geolocation Service - Fase 4.4 Timbratura

export interface GeolocationPosition {
  latitude: number
  longitude: number
  accuracy: number  // Accuracy in meters
  timestamp: number
}

export interface GeolocationError {
  code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'NOT_SUPPORTED'
  message: string
}

export interface VenueLocation {
  id: string
  name: string
  latitude: number
  longitude: number
  geoFenceRadius: number  // Meters
}

export interface DistanceCheckResult {
  distanceMeters: number
  isWithinRadius: boolean
  venue: VenueLocation
  userPosition: GeolocationPosition
}

export interface GeolocationState {
  position: GeolocationPosition | null
  error: GeolocationError | null
  isLoading: boolean
  isSupported: boolean
}

export interface UseGeolocationOptions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}

export const DEFAULT_GEOLOCATION_OPTIONS: UseGeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 10000,      // 10 seconds
  maximumAge: 60000,   // 1 minute cache
}
