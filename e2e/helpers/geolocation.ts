import { BrowserContext } from '@playwright/test'

/**
 * Coordinate test per diverse sedi
 */
export const TEST_LOCATIONS = {
  // Weiss Cafè - coordinate approssimative centro Sacile
  weissCafe: {
    latitude: 45.952,
    longitude: 12.498,
    accuracy: 10,
  },
  // Posizione fuori raggio (500m di distanza)
  outsideRadius: {
    latitude: 45.96,
    longitude: 12.51,
    accuracy: 10,
  },
  // Posizione molto lontana
  farAway: {
    latitude: 46.0,
    longitude: 12.6,
    accuracy: 10,
  },
}

/**
 * Imposta geolocalizzazione mock per il contesto browser
 */
export async function setGeolocation(
  context: BrowserContext,
  location: { latitude: number; longitude: number; accuracy?: number }
) {
  await context.setGeolocation({
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? 10,
  })
}

/**
 * Imposta geolocalizzazione dentro il raggio della sede
 */
export async function setLocationInsideVenue(context: BrowserContext) {
  await setGeolocation(context, TEST_LOCATIONS.weissCafe)
}

/**
 * Imposta geolocalizzazione fuori dal raggio della sede
 */
export async function setLocationOutsideVenue(context: BrowserContext) {
  await setGeolocation(context, TEST_LOCATIONS.outsideRadius)
}

/**
 * Concede permessi geolocalizzazione
 */
export async function grantGeolocationPermission(context: BrowserContext) {
  await context.grantPermissions(['geolocation'])
}

/**
 * Setup completo geolocalizzazione per test attendance
 */
export async function setupGeolocationForTests(
  context: BrowserContext,
  insideVenue: boolean = true
) {
  await grantGeolocationPermission(context)

  if (insideVenue) {
    await setLocationInsideVenue(context)
  } else {
    await setLocationOutsideVenue(context)
  }
}

/**
 * Simula movimento da una posizione all'altra
 */
export async function simulateMovement(
  context: BrowserContext,
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  steps: number = 5,
  delayMs: number = 500
) {
  const latStep = (to.latitude - from.latitude) / steps
  const lonStep = (to.longitude - from.longitude) / steps

  for (let i = 0; i <= steps; i++) {
    await setGeolocation(context, {
      latitude: from.latitude + latStep * i,
      longitude: from.longitude + lonStep * i,
    })
    if (i < steps) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
