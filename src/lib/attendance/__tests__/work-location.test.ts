import { describe, it, expect } from 'vitest'
import { pickWorkLocation, type AssignedLocation } from '../work-location'

/**
 * Coordinate reali dei luoghi Weiss, così i test parlano di distanze vere.
 * Piazza del Popolo a Sacile e Villa Varda a Brugnera distano qualche km.
 */
const weiss: AssignedLocation = {
  id: 'weiss',
  name: 'Weiss Cafè',
  latitude: 45.953621,
  longitude: 12.503256,
  geofenceRadiusMeters: 100,
  trackingMode: 'GPS_GEOFENCE',
}

const villaVarda: AssignedLocation = {
  id: 'villa-varda',
  name: 'Villa Varda',
  latitude: 45.90944,
  longitude: 12.53861,
  geofenceRadiusMeters: 150,
  trackingMode: 'GPS_GEOFENCE',
}

describe('pickWorkLocation', () => {
  it('sceglie il luogo nel cui raggio ci si trova', () => {
    // Venti metri a nord del bar
    const scelta = pickWorkLocation([weiss, villaVarda], {
      latitude: 45.95380,
      longitude: 12.503256,
    })

    expect(scelta.location?.id).toBe('weiss')
    expect(scelta.isWithinRadius).toBe(true)
    expect(scelta.distanceMeters).toBeLessThan(50)
  })

  it('distingue fra due luoghi diversi', () => {
    const scelta = pickWorkLocation([weiss, villaVarda], {
      latitude: 45.90950,
      longitude: 12.53861,
    })

    expect(scelta.location?.id).toBe('villa-varda')
    expect(scelta.isWithinRadius).toBe(true)
  })

  it('fuori da tutti i raggi indica comunque il più vicino, segnalandolo', () => {
    // A metà strada fra i due
    const scelta = pickWorkLocation([weiss, villaVarda], {
      latitude: 45.93,
      longitude: 12.52,
    })

    expect(scelta.location).not.toBeNull()
    expect(scelta.isWithinRadius).toBe(false)
    expect(scelta.distanceMeters).toBeGreaterThan(150)
  })

  it('rispetta il raggio proprio di ciascun luogo', () => {
    // 120 metri da Villa Varda: dentro il suo raggio di 150...
    const vicino = pickWorkLocation([villaVarda], {
      latitude: 45.91052,
      longitude: 12.53861,
    })
    expect(vicino.isWithinRadius).toBe(true)

    // ...mentre la stessa distanza dal bar, che ne ha 100, è fuori
    const lontano = pickWorkLocation([weiss], {
      latitude: 45.954699,
      longitude: 12.503256,
    })
    expect(lontano.isWithinRadius).toBe(false)
  })

  it('senza coordinate del dispositivo non sceglie nulla', () => {
    const scelta = pickWorkLocation([weiss, villaVarda], null)

    expect(scelta.location).toBeNull()
    expect(scelta.distanceMeters).toBeNull()
  })

  it('con un solo luogo assegnato lo usa anche senza coordinate', () => {
    // Se non c'è ambiguità il luogo è noto: serve per chi dichiara le ore
    const scelta = pickWorkLocation([weiss], null)

    expect(scelta.location?.id).toBe('weiss')
    expect(scelta.isWithinRadius).toBe(false)
  })

  it('ignora i luoghi senza coordinate quando deve misurare la distanza', () => {
    const senzaMappa: AssignedLocation = {
      id: 'ufficio',
      name: 'Ufficio',
      latitude: null,
      longitude: null,
      geofenceRadiusMeters: 100,
      trackingMode: 'GPS_GEOFENCE',
    }

    const scelta = pickWorkLocation([senzaMappa, weiss], {
      latitude: 45.95380,
      longitude: 12.503256,
    })

    expect(scelta.location?.id).toBe('weiss')
  })

  it('senza luoghi assegnati non sceglie nulla', () => {
    const scelta = pickWorkLocation([], { latitude: 45.95, longitude: 12.5 })

    expect(scelta.location).toBeNull()
  })
})
