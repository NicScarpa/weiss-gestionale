/**
 * Sentry Edge Configuration
 * Configurazione per il monitoraggio errori nell'edge runtime
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
})
