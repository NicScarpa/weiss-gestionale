import { calculateDistance } from '@/lib/geolocation'

/**
 * In quale luogo di lavoro sta timbrando questa persona.
 *
 * Con più luoghi assegnati la domanda non è banale: il dispositivo manda le
 * coordinate, e il luogo è quello più vicino fra quelli su cui la persona è
 * abilitata. Si sceglie il più vicino anche quando è fuori raggio, perché una
 * timbratura fuori sede va comunque attribuita a un posto per poter essere
 * rivista: registrarla senza luogo la renderebbe incomprensibile dopo.
 */

export interface AssignedLocation {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  geofenceRadiusMeters: number
  trackingMode: 'GPS_GEOFENCE' | 'MANUAL_HOURS' | 'VIEW_ONLY'
}

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface WorkLocationChoice {
  location: AssignedLocation | null
  distanceMeters: number | null
  isWithinRadius: boolean
}

export function pickWorkLocation(
  assigned: AssignedLocation[],
  coordinates: Coordinates | null
): WorkLocationChoice {
  if (assigned.length === 0) {
    return { location: null, distanceMeters: null, isWithinRadius: false }
  }

  if (!coordinates) {
    // Senza posizione non si può misurare nulla. Se però il luogo è uno solo
    // non c'è ambiguità da risolvere: è quello.
    return {
      location: assigned.length === 1 ? assigned[0] : null,
      distanceMeters: null,
      isWithinRadius: false,
    }
  }

  const misurabili = assigned.filter(
    (l) => l.latitude !== null && l.longitude !== null
  )

  if (misurabili.length === 0) {
    return {
      location: assigned.length === 1 ? assigned[0] : null,
      distanceMeters: null,
      isWithinRadius: false,
    }
  }

  let scelto = misurabili[0]
  let distanzaMinima = Infinity

  for (const luogo of misurabili) {
    const distanza = calculateDistance(
      coordinates.latitude,
      coordinates.longitude,
      luogo.latitude!,
      luogo.longitude!
    )

    if (distanza < distanzaMinima) {
      distanzaMinima = distanza
      scelto = luogo
    }
  }

  const distanceMeters = Math.round(distanzaMinima)

  return {
    location: scelto,
    distanceMeters,
    isWithinRadius: distanceMeters <= scelto.geofenceRadiusMeters,
  }
}
