import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as postazioni } from '../route'

/**
 * La configurazione delle postazioni di cassa descrive come è organizzato
 * l'incasso della sede: è riservata ad admin e manager (finding A2-05).
 * La sede arriva dalla sessione, non dal segmento di rotta: un id nell'URL che
 * non corrisponde alla sede dell'utente non deve restituire nulla.
 */
setupIntegrationDb()

describe('GET /api/venues/[id]/cash-stations', () => {
  it('nega la configurazione delle casse a uno staff', async () => {
    const venue = await venueDiTest()
    await entraCome('staff')

    const { status } = await callRoute(
      postazioni,
      jsonRequest(`/api/venues/${venue.id}/cash-stations`),
      { id: venue.id }
    )

    expect(status).toBe(403)
  })

  it('la concede a un manager sulla propria sede', async () => {
    const venue = await venueDiTest()
    await entraCome('manager')

    const { status, body } = await callRoute<{ cashStations: unknown[] }>(
      postazioni,
      jsonRequest(`/api/venues/${venue.id}/cash-stations`),
      { id: venue.id }
    )

    expect(status).toBe(200)
    expect(body.cashStations.length).toBeGreaterThan(0)
  })

  it('nega una sede diversa da quella della sessione', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      postazioni,
      jsonRequest('/api/venues/sede-di-un-altro/cash-stations'),
      { id: 'sede-di-un-altro' }
    )

    expect(status).toBe(403)
  })
})
