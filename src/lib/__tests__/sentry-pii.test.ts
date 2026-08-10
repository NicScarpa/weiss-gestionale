import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Event } from '@sentry/nextjs'

import { CHIAVI_SENSIBILI, opzioniSentryComuni, oscura, oscuraPii } from '../sentry-pii'

/**
 * Lo scrubbing lato browser era già coperto end-to-end da
 * src/sentry-capture.test.ts. Quello dei runtime Node ed Edge no: stava in due
 * file di configurazione che nessun test importava. Ora che il codice è uno
 * solo, questi test lo coprono per tutti e tre.
 */

/** `stubEnv` invece di scrivere su process.env: NODE_ENV non è riassegnabile. */
function ambiente(valore: string) {
  vi.stubEnv('NODE_ENV', valore)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('oscura', () => {
  it('sostituisce i valori sensibili e lascia stare gli altri', () => {
    const dati = { iban: 'IT60X0542811101000000123456', pagina: '/login' }

    oscura(dati)

    expect(dati.iban).toBe('[REDACTED]')
    expect(dati.pagina).toBe('/login')
  })

  it('non inventa chiavi che non c erano', () => {
    const dati: Record<string, unknown> = {}

    oscura(dati)

    expect(Object.keys(dati)).toHaveLength(0)
  })

  it('copre i campi retributivi e di contatto del personale', () => {
    // Le paghe orarie e i recapiti sono le PII che questo gestionale tratta di
    // più: se sparissero dall elenco, nessun altro test se ne accorgerebbe.
    for (const chiave of ['hourlyRate', 'codiceFiscale', 'whatsappNumber', 'portalPin']) {
      expect(CHIAVI_SENSIBILI).toContain(chiave)
    }
  })
})

describe('oscuraPii', () => {
  it('ripulisce le breadcrumb', () => {
    const evento: Event = {
      breadcrumbs: [{ category: 'auth', data: { password: 'segreta', pagina: '/login' } }],
    }

    expect(oscuraPii(evento).breadcrumbs?.[0].data).toEqual({
      password: '[REDACTED]',
      pagina: '/login',
    })
  })

  it('ripulisce il corpo della richiesta', () => {
    const evento: Event = {
      request: { data: { email: 'titolare@weisscafe.com', importo: 12.5 } },
    }

    expect(oscuraPii(evento).request?.data).toEqual({
      email: '[REDACTED]',
      importo: 12.5,
    })
  })

  it('lascia intatto un corpo che non è un oggetto', () => {
    const evento: Event = { request: { data: 'testo libero' } }

    expect(oscuraPii(evento).request?.data).toBe('testo libero')
  })

  it('toglie mail, IP e nome utente dal contesto utente ma tiene l id', () => {
    const evento: Event = {
      user: {
        id: 'utente-1',
        email: 'titolare@weisscafe.com',
        ip_address: '1.2.3.4',
        username: 'nicola',
      },
    }

    expect(oscuraPii(evento).user).toEqual({ id: 'utente-1' })
  })

  it('non si rompe su un evento vuoto', () => {
    expect(oscuraPii({})).toEqual({})
  })
})

describe('opzioniSentryComuni', () => {
  it('non invia PII per default', () => {
    expect(opzioniSentryComuni().sendDefaultPii).toBe(false)
  })

  it('in sviluppo senza DSN pubblico non spedisce nulla', () => {
    ambiente('development')
    delete process.env.NEXT_PUBLIC_SENTRY_DSN

    expect(opzioniSentryComuni().beforeSend({})).toBeNull()
  })

  it('in produzione l evento parte, ma oscurato', () => {
    ambiente('production')

    const evento = opzioniSentryComuni().beforeSend({
      user: { id: 'utente-1', email: 'titolare@weisscafe.com' },
      request: { data: { iban: 'IT60X0542811101000000123456' } },
    })

    expect(evento?.user).toEqual({ id: 'utente-1' })
    expect(evento?.request?.data).toEqual({ iban: '[REDACTED]' })
  })

  it('campiona il dieci per cento in produzione e tutto altrove', () => {
    ambiente('production')
    expect(opzioniSentryComuni().tracesSampleRate).toBe(0.1)

    ambiente('development')
    expect(opzioniSentryComuni().tracesSampleRate).toBe(1.0)
  })
})
