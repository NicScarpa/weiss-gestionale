/**
 * Sentry Server Configuration
 * Configurazione per il monitoraggio errori lato server
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // Il DSN del server non deve per forza essere pubblico: src/instrumentation.ts
  // carica questo file solo se una delle due variabili è configurata.
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

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
          const sensitiveKeys = [
            'email', 'password', 'token', 'iban', 'fiscalCode', 'vatNumber',
            'hourlyRate', 'resetToken', 'phoneNumber', 'phone', 'address',
            'indirizzo', 'whatsappNumber', 'codiceFiscale', 'partitaIva',
            'beneficiarioIban', 'controparteIban', 'portalPin',
          ]
          for (const key of sensitiveKeys) {
            if (key in b.data) b.data[key] = '[REDACTED]'
          }
        }
        return b
      })
    }

    // Scrub request body data
    if (event.request?.data) {
      const bodyKeys = [
        'email', 'password', 'token', 'iban', 'fiscalCode', 'vatNumber',
        'hourlyRate', 'resetToken', 'phoneNumber', 'phone', 'address',
        'indirizzo', 'whatsappNumber', 'codiceFiscale', 'partitaIva',
        'beneficiarioIban', 'controparteIban', 'portalPin',
      ]
      if (typeof event.request.data === 'object' && event.request.data !== null) {
        const data = event.request.data as Record<string, unknown>
        for (const key of bodyKeys) {
          if (key in data) data[key] = '[REDACTED]'
        }
      }
    }

    // Scrub user context
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
      delete event.user.username
    }

    return event
  },
})
