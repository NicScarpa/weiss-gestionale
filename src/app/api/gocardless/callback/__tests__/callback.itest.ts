import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

  /**
   * L'host del redirect, che è la parte che si rompe in produzione e non in
   * locale.
   *
   * I tre casi qui sopra guardano solo il percorso, e infatti hanno visto
   * passare il difetto: dietro il proxy di Railway il server ascolta su
   * `localhost:8080`, `request.url` porta quell'host, e il ritorno dalla
   * banca finiva su una porta che sulla macchina di chi naviga non esiste.
   */
  describe("l'host del redirect", () => {
    let ambientePrecedente: NodeJS.ProcessEnv

    beforeEach(() => {
      ambientePrecedente = { ...process.env }
      delete process.env.APP_URL
      delete process.env.NEXTAUTH_URL
    })

    afterEach(() => {
      process.env = ambientePrecedente
    })

    it("è quello pubblico configurato, non l'host interno da cui arriva la richiesta", async () => {
      process.env.APP_URL = 'https://gestionale.esempio.it'

      const esito = await callRoute(
        ritorno,
        jsonRequest('http://localhost:8080/api/gocardless/callback?ref=conn-123')
      )

      const destinazione = new URL(esito.headers.get('location') ?? '')
      expect(destinazione.origin).toBe('https://gestionale.esempio.it')
      expect(destinazione.searchParams.get('collegamento')).toBe('conn-123')
    })

    it('vale anche con NEXTAUTH_URL sola, che è quella che c è sempre', async () => {
      process.env.NEXTAUTH_URL = 'https://gestionale.esempio.it'

      const esito = await callRoute(
        ritorno,
        jsonRequest('http://localhost:8080/api/gocardless/callback?ref=conn-123')
      )

      expect(new URL(esito.headers.get('location') ?? '').origin).toBe('https://gestionale.esempio.it')
    })

    it('senza indirizzo configurato ricade sulla richiesta, così in locale non cambia niente', async () => {
      const esito = await callRoute(
        ritorno,
        jsonRequest('http://localhost:3000/api/gocardless/callback?ref=conn-123')
      )

      expect(new URL(esito.headers.get('location') ?? '').origin).toBe('http://localhost:3000')
    })
  })
})
