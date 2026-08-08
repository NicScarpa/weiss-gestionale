import * as Sentry from '@sentry/nextjs'

/**
 * Punto di aggancio di Sentry lato server ed edge.
 *
 * I file sentry.server.config.ts e sentry.edge.config.ts esistevano già ma
 * nessuno li importava: senza questo modulo Next non li carica mai e nessun
 * errore di produzione viene registrato.
 *
 * Il DSN del server non deve per forza essere pubblico, quindi SENTRY_DSN ha
 * la precedenza; NEXT_PUBLIC_SENTRY_DSN resta accettato perché è quello con
 * cui il progetto è nato.
 */
function dsnConfigurato(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
}

export async function register(): Promise<void> {
  // Senza DSN non inizializziamo nulla: i config chiamano Sentry.init() al
  // momento dell'import, e una init a vuoto sporcherebbe i log in sviluppo e
  // nei test senza portare alcun beneficio.
  if (!dsnConfigurato()) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

/**
 * Next chiama questo hook per ogni errore non gestito nelle richieste (route
 * handler, server component, middleware). Senza client attivo restiamo inerti.
 */
export const onRequestError: typeof Sentry.captureRequestError = (...argomenti) => {
  if (!Sentry.getClient()) return
  return Sentry.captureRequestError(...argomenti)
}
