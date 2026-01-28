/**
 * Sentry Server Configuration
 * Configurazione per il monitoraggio errori lato server
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Percentuale di transazioni da tracciare
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Environment
  environment: process.env.NODE_ENV,

  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Prima di inviare l'evento
  beforeSend(event, _hint) {
    // Non inviare errori in development (a meno che DSN sia configurato)
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null
    }

    return event
  },
})
