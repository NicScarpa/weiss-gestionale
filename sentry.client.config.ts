/**
 * Sentry Client Configuration
 * Configurazione per il monitoraggio errori lato client
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Percentuale di transazioni da tracciare per performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay per debug degli errori
  replaysSessionSampleRate: 0.1, // 10% delle sessioni normali
  replaysOnErrorSampleRate: 1.0, // 100% delle sessioni con errori

  // Environment
  environment: process.env.NODE_ENV,

  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      // Mascherare tutti i testi per privacy
      maskAllText: true,
      // Bloccare tutti i media
      blockAllMedia: true,
    }),
  ],

  // Ignora errori comuni non critici
  ignoreErrors: [
    // Network errors
    'Failed to fetch',
    'NetworkError',
    'Network request failed',
    // Browser extensions
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    // Resize observer (comune e non critico)
    'ResizeObserver loop',
    // Abort errors
    'AbortError',
    // Loading chunk errors (retry automatico di Next.js)
    'Loading chunk',
  ],

  // Prima di inviare l'evento
  beforeSend(event, hint) {
    // Non inviare errori in development (a meno che DSN sia configurato)
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null
    }

    return event
  },
})
