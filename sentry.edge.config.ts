/**
 * Sentry Edge Configuration
 * Configurazione per il monitoraggio errori nell'edge runtime
 */

import * as Sentry from '@sentry/nextjs'

import { opzioniSentryComuni } from '@/lib/sentry-pii'

Sentry.init({
  // Il DSN del server non deve per forza essere pubblico: src/instrumentation.ts
  // carica questo file solo se una delle due variabili è configurata.
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  ...opzioniSentryComuni(),
})
