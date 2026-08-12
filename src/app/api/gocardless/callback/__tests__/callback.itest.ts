import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { logout } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { GET as ritorno } from '../route'

setupIntegrationDb()

describe('GET /api/gocardless/callback', () => {
  it('riporta al pannello indicando il collegamento', async () => {
    const esito = await callRoute(ritorno, jsonRequest('http://localhost/api/gocardless/callback?ref=conn-123'))

    expect(esito.status).toBe(307)
    expect(esito.headers.get('location')).toContain('/impostazioni/banche-e-conti?collegamento=conn-123')
  })

  // Se il riferimento manca non si va in errore: si torna al pannello, che
  // saprà mostrare lo stato vero.
  it('senza riferimento riporta comunque al pannello', async () => {
    const esito = await callRoute(ritorno, jsonRequest('http://localhost/api/gocardless/callback'))
    expect(esito.status).toBe(307)
    expect(esito.headers.get('location')).toContain('/impostazioni/banche-e-conti')
  })

  // Il ritorno dalla banca è una navigazione del browser: una sessione scaduta
  // deve portare al login, non a un JSON 401 sullo schermo.
  it('reindirizza anche senza sessione, invece di rispondere 401', async () => {
    logout()
    const esito = await callRoute(ritorno, jsonRequest('http://localhost/api/gocardless/callback?ref=conn-123'))
    expect(esito.status).toBe(307)
  })
})
