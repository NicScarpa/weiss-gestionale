import type { Event } from '@sentry/nextjs'

/**
 * Oscuramento dei dati personali prima che un evento parta verso Sentry.
 *
 * Stava scritto tre volte — sentry.server.config.ts, sentry.edge.config.ts e
 * src/instrumentation-client.ts — con lo stesso elenco di chiavi ricopiato a
 * mano in cinque punti. Una copia dimenticata non fa rumore: l'evento parte
 * lo stesso, solo con dentro l'IBAN. Qui l'elenco è uno, e chi lo allunga
 * copre tutti e tre i runtime insieme.
 */

/** Campi che non devono mai lasciare il processo. */
export const CHIAVI_SENSIBILI = [
  'email', 'password', 'token', 'iban', 'fiscalCode', 'vatNumber',
  'hourlyRate', 'resetToken', 'phoneNumber', 'phone', 'address',
  'indirizzo', 'whatsappNumber', 'codiceFiscale', 'partitaIva',
  'beneficiarioIban', 'controparteIban', 'portalPin',
] as const

/** Sostituisce sul posto i valori sensibili di primo livello. */
export function oscura(dati: Record<string, unknown>): void {
  for (const chiave of CHIAVI_SENSIBILI) {
    if (chiave in dati) dati[chiave] = '[REDACTED]'
  }
}

/**
 * Ripulisce breadcrumb, corpo della richiesta e contesto utente di un evento.
 * Modifica l'evento sul posto e lo restituisce, come vuole `beforeSend`.
 */
export function oscuraPii<E extends Event>(evento: E): E {
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
}

/**
 * Opzioni comuni ai runtime Node ed Edge.
 *
 * I due file di configurazione erano identici riga per riga: tenerli separati
 * significava che una modifica alla frequenza di campionamento o allo
 * scrubbing andava fatta due volte, e la seconda prima o poi si dimentica.
 * Il DSN non è fra le opzioni perché lo decide chi chiama.
 */
export function opzioniSentryComuni() {
  return {
    // Percentuale di transazioni da tracciare
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    environment: process.env.NODE_ENV,

    debug: process.env.NODE_ENV === 'development',

    sendDefaultPii: false,

    beforeSend<E extends Event>(evento: E): E | null {
      // In sviluppo non si spedisce nulla, a meno che il DSN pubblico sia
      // configurato apposta per provare l'integrazione.
      if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
        return null
      }

      return oscuraPii(evento)
    },
  }
}
