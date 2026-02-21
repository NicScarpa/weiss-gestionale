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

  // Do not send PII by default
  sendDefaultPii: false,

  // Prima di inviare l'evento
  beforeSend(event, _hint) {
    // Non inviare errori in development (a meno che DSN sia configurato)
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null
    }

    // Scrub PII from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(b => {
        if (b.data) {
          const sensitiveKeys = ['email', 'password', 'token', 'iban', 'fiscalCode', 'vatNumber', 'hourlyRate', 'resetToken']
          for (const key of sensitiveKeys) {
            if (key in b.data) b.data[key] = '[REDACTED]'
          }
        }
        return b
      })
    }
    // Scrub user context
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
    }

    return event
  },
})
