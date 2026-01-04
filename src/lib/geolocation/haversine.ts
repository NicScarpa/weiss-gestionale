// Haversine formula for calculating distance between two GPS coordinates
// https://en.wikipedia.org/wiki/Haversine_formula

const EARTH_RADIUS_METERS = 6371000 // Earth's radius in meters

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Calculate the distance between two GPS coordinates using the Haversine formula
 * @param lat1 Latitude of point 1 (degrees)
 * @param lon1 Longitude of point 1 (degrees)
 * @param lat2 Latitude of point 2 (degrees)
 * @param lon2 Longitude of point 2 (degrees)
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_METERS * c
}

/**
 * Check if a position is within a specified radius of a target location
 * @param userLat User's latitude (degrees)
 * @param userLon User's longitude (degrees)
 * @param targetLat Target latitude (degrees)
 * @param targetLon Target longitude (degrees)
 * @param radiusMeters Allowed radius in meters
 * @returns Object with distance and whether user is within radius
 */
export function isWithinRadius(
  userLat: number,
  userLon: number,
  targetLat: number,
  targetLon: number,
  radiusMeters: number
): { distance: number; isWithin: boolean } {
  const distance = calculateDistance(userLat, userLon, targetLat, targetLon)
  return {
    distance: Math.round(distance), // Round to nearest meter
    isWithin: distance <= radiusMeters,
  }
}

/**
 * Format distance for display
 * @param meters Distance in meters
 * @returns Formatted string (e.g., "150m" or "1.2km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`
  }
  return `${(meters / 1000).toFixed(1)}km`
}
