import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import type { Event } from '@sentry/nextjs'

import { opzioniSentryClient } from './instrumentation-client'

/**
 * Il tipo dell'envelope, ricavato dal transport invece che importato.
 *
 * `Envelope` sta in `@sentry/core` e `@sentry/nextjs` non lo riespone: questo
 * import esisteva ma non ha mai risolto — il file non passava sotto il
 * compilatore e l'errore non lo vedeva nessuno. Prenderlo da `@sentry/core`
 * significherebbe importare un pacchetto che il progetto non dichiara fra le
 * dipendenze, cosa che knip blocca in CI, e a ragione. Derivarlo dalla firma
 * pubblica di `Sentry.init` dà lo stesso tipo, esatto, senza aggiungere nulla.
 */
type OpzioniInit = NonNullable<Parameters<typeof Sentry.init>[0]>
type FabbricaTrasporto = NonNullable<OpzioniInit['transport']>
type Envelope = Parameters<ReturnType<FabbricaTrasporto>['send']>[0]

/**
 * Verifica end-to-end che un errore forzato attraversi davvero la pipeline
 * Sentry con le opzioni che usiamo in produzione: non basta sapere che
 * captureException è stata chiamata, serve vedere l'evento uscire dal
 * transport. Il transport reale è sostituito da uno che tiene gli envelope in
 * memoria, così il test non tocca la rete.
 */

const DSN = 'https://chiave@o0.ingest.sentry.io/1'

const envelopeInviati: Envelope[] = []

function eventiCatturati(): Event[] {
  return envelopeInviati.flatMap(([, items]) =>
    items
      .filter(([intestazione]) => intestazione.type === 'event')
      .map(([, payload]) => payload as Event)
  )
}

beforeAll(() => {
  Sentry.init({
    ...opzioniSentryClient(DSN),
    // Le integrazioni di default (replay, breadcrumb del DOM) sono rumore in
    // jsdom e non sono l'oggetto di questo test: qui interessa la pipeline.
    integrations: [],
    transport: () => ({
      send: async (envelope: Envelope) => {
        envelopeInviati.push(envelope)
        return {}
      },
      flush: async () => true,
    }),
  })
})

afterAll(async () => {
  await Sentry.close()
})

describe('cattura degli errori con DSN configurato', () => {
  it('un errore forzato arriva al transport', async () => {
    Sentry.captureException(new Error('errore-forzato-di-prova'))
    await Sentry.flush(2000)

    const valori = eventiCatturati().flatMap((evento) => evento.exception?.values ?? [])
    expect(valori.map((v) => v.value)).toContain('errore-forzato-di-prova')
  })

  it('la mail dell utente non finisce nell evento', async () => {
    Sentry.setUser({ id: 'utente-1', email: 'titolare@weisscafe.com' })
    Sentry.captureException(new Error('errore-con-utente'))
    await Sentry.flush(2000)

    const evento = eventiCatturati().find((e) =>
      e.exception?.values?.some((v) => v.value === 'errore-con-utente')
    )
    expect(evento).toBeDefined()
    expect(evento?.user?.email).toBeUndefined()
    expect(evento?.user?.id).toBe('utente-1')
  })

  it('i dati sensibili nelle breadcrumb sono oscurati', async () => {
    Sentry.addBreadcrumb({
      category: 'auth',
      data: { password: 'segreta', iban: 'IT60X0542811101000000123456', pagina: '/login' },
    })
    Sentry.captureException(new Error('errore-con-breadcrumb'))
    await Sentry.flush(2000)

    const evento = eventiCatturati().find((e) =>
      e.exception?.values?.some((v) => v.value === 'errore-con-breadcrumb')
    )
    const briciola = evento?.breadcrumbs?.find((b) => b.category === 'auth')
    expect(briciola?.data?.password).toBe('[REDACTED]')
    expect(briciola?.data?.iban).toBe('[REDACTED]')
    expect(briciola?.data?.pagina).toBe('/login')
  })
})
