import * as Sentry from '@sentry/nextjs'

import { oscuraPii } from '@/lib/sentry-pii'

/**
 * Inizializzazione di Sentry lato browser.
 *
 * Sostituisce il vecchio sentry.client.config.ts alla radice: con Turbopack,
 * che in Next 16 è il bundler di default, quel file non viene più letto, e
 * tenerli entrambi porterebbe a due Sentry.init() nello stesso bundle.
 *
 * L'oscuramento dei dati personali sta in `@/lib/sentry-pii`, in comune con i
 * runtime Node ed Edge: l'elenco delle chiavi da nascondere è uno solo.
 */

type OpzioniClient = NonNullable<Parameters<typeof Sentry.init>[0]>

/**
 * Le integrazioni stanno fuori da opzioniSentryClient perché replayIntegration
 * esiste solo nel bundle browser del pacchetto: sotto vitest @sentry/nextjs
 * risolve al bundle server, dove quella funzione non è esportata.
 */
function integrazioniClient(): OpzioniClient['integrations'] {
  return [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ]
}

export function opzioniSentryClient(dsn: string): OpzioniClient {
  return {
    dsn,

    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session Replay per il debug degli errori
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    environment: process.env.NODE_ENV,

    ignoreErrors: [
      'Failed to fetch',
      'NetworkError',
      'Network request failed',
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      'ResizeObserver loop',
      'AbortError',
      // Next riprova da solo a caricare i chunk
      'Loading chunk',
    ],

    sendDefaultPii: false,

    beforeSend: oscuraPii,
  }
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Nessun DSN: nessuna inizializzazione e nessun log. Il progetto deve poter
// girare in sviluppo, nei test e in build senza alcuna configurazione Sentry.
if (dsn) {
  Sentry.init({ ...opzioniSentryClient(dsn), integrations: integrazioniClient() })
}

/** Richiesto dall'App Router per tracciare le navigazioni lato client. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
