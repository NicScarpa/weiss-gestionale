import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ottieniLinkInvito, rigeneraLinkInvito } from '../inviti-staff'

/**
 * Da quando la GET di /api/staff/invite non emette più credenziali — una
 * lettura non deve creare un invito valido sette giorni — la schermata che
 * mostra il link deve saper ricadere sulla POST. Senza quel passaggio, alla
 * prima apertura dopo la scadenza dell'ultimo invito l'admin resterebbe davanti
 * a un messaggio d'errore senza vie d'uscita.
 */

const INVITO = {
  token: 'tok-1',
  url: 'https://gestionale.example/invito?token=tok-1',
  expiresAt: '2026-08-14T00:00:00.000Z',
  emailSent: false,
}

const VUOTO = { token: null, url: null, expiresAt: null, emailSent: false }

function rispostaJson(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

describe('inviti-staff', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('ottieniLinkInvito', () => {
    it("restituisce l'invito attivo senza emetterne un altro", async () => {
      fetchMock.mockResolvedValueOnce(rispostaJson(INVITO))

      const invito = await ottieniLinkInvito()

      expect(invito.url).toBe(INVITO.url)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined()
    })

    it('ne fa emettere uno quando non ce ne sono di attivi', async () => {
      fetchMock
        .mockResolvedValueOnce(rispostaJson(VUOTO))
        .mockResolvedValueOnce(rispostaJson(INVITO))

      const invito = await ottieniLinkInvito()

      expect(invito.url).toBe(INVITO.url)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[1][0]).toBe('/api/staff/invite')
      expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')
    })

    it("propaga l'errore della lettura invece di tentare di emettere", async () => {
      fetchMock.mockResolvedValueOnce(rispostaJson({ error: 'Non autorizzato' }, false, 403))

      await expect(ottieniLinkInvito()).rejects.toThrow('Non autorizzato')
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it("propaga l'errore dell'emissione", async () => {
      fetchMock
        .mockResolvedValueOnce(rispostaJson(VUOTO))
        .mockResolvedValueOnce(rispostaJson({ error: 'Errore interno' }, false, 500))

      await expect(ottieniLinkInvito()).rejects.toThrow('Errore interno')
    })
  })

  describe('rigeneraLinkInvito', () => {
    it('chiede la rigenerazione senza email', async () => {
      fetchMock.mockResolvedValueOnce(rispostaJson(INVITO))

      await rigeneraLinkInvito()

      const corpo = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(corpo).toEqual({ action: 'regenerate' })
    })

    it("vincola l'invito all'email quando è indicata", async () => {
      fetchMock.mockResolvedValueOnce(rispostaJson({ ...INVITO, emailSent: true }))

      const invito = await rigeneraLinkInvito({ email: 'nuovo@weisscafe.it' })

      const corpo = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(corpo).toEqual({ action: 'regenerate', email: 'nuovo@weisscafe.it' })
      expect(invito.emailSent).toBe(true)
    })

    it('segnala un messaggio leggibile se la risposta non ne porta uno', async () => {
      fetchMock.mockResolvedValueOnce(rispostaJson({}, false, 500))

      await expect(rigeneraLinkInvito()).rejects.toThrow(/invito/i)
    })
  })
})
