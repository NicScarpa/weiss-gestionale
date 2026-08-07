import * as Sentry from '@sentry/nextjs'

/**
 * Inizializzazione di Sentry lato browser.
 *
 * Sostituisce il vecchio sentry.client.config.ts alla radice: con Turbopack,
 * che in Next 16 è il bundler di default, quel file non viene più letto, e
 * tenerli entrambi porterebbe a due Sentry.init() nello stesso bundle.
 */

/** Campi che non devono mai lasciare il browser. */
const CHIAVI_SENSIBILI = [
  'email', 'password', 'token', 'iban', 'fiscalCode', 'vatNumber',
  'hourlyRate', 'resetToken', 'phoneNumber', 'phone', 'address',
  'indirizzo', 'whatsappNumber', 'codiceFiscale', 'partitaIva',
  'beneficiarioIban', 'controparteIban', 'portalPin',
]

function oscura(dati: Record<string, unknown>): void {
  for (const chiave of CHIAVI_SENSIBILI) {
    if (chiave in dati) dati[chiave] = '[REDACTED]'
  }
}

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

    beforeSend(evento) {
      if (evento.breadcrumbs) {
        for (const briciola of evento.breadcrumbs) {
          if (briciola.data) oscura(briciola.data)
        }
      }

      const corpo = evento.request?.data
      if (typeof corpo === 'object' && corpo !== null) {
        oscura(corpo as Record<string, unknown>)
      }

      if (evento.user) {
        delete evento.user.email
        delete evento.user.ip_address
        delete evento.user.username
      }

      return evento
    },
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
