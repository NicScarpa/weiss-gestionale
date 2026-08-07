/**
 * Invio di notifiche via Web Push (standard VAPID, RFC 8030 / RFC 8291).
 *
 * Sostituisce il vecchio percorso Firebase Cloud Messaging. Il payload viene
 * cifrato con le chiavi della sottoscrizione e consegnato al push service del
 * browser (Google, Mozilla, Apple...): nessun servizio terzo da configurare,
 * solo una coppia di chiavi VAPID generata una volta.
 *
 * Il formato del payload è quello che `src/app/sw.ts` già si aspetta
 * nell'evento `push`.
 */

import webpush from 'web-push'
import { logger } from '@/lib/logger'
import { getVapidConfig } from './vapid'
import type { SottoscrizionePush } from './subscriptions'
import type { NotificationResult, PushPayload } from './types'

/** Errore convenzionale: la sottoscrizione non esiste più lato browser. */
export const SOTTOSCRIZIONE_DEFUNTA = 'subscription_gone'

let configurato = false

/**
 * Imposta le chiavi VAPID sulla libreria. Ritorna false se il canale non è
 * configurato: in quel caso non si invia nulla e lo si dice apertamente.
 */
function preparaCanale(): boolean {
  if (configurato) return true

  const config = getVapidConfig()
  if (!config) return false

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  configurato = true
  return true
}

/**
 * Invia una notifica a un singolo dispositivo.
 */
export async function inviaPush(
  sottoscrizione: SottoscrizionePush,
  payload: PushPayload
): Promise<NotificationResult> {
  if (!preparaCanale()) {
    return { success: false, error: 'Canale push non configurato (chiavi VAPID assenti)' }
  }

  try {
    const risposta = await webpush.sendNotification(
      {
        endpoint: sottoscrizione.endpoint,
        keys: { p256dh: sottoscrizione.p256dh, auth: sottoscrizione.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }
    )

    return { success: true, messageId: risposta.headers?.location ?? sottoscrizione.id }
  } catch (error: unknown) {
    const errore = error as { statusCode?: number; body?: string; message?: string }

    // 404/410: il browser ha revocato la sottoscrizione, va disattivata.
    if (errore.statusCode === 404 || errore.statusCode === 410) {
      return { success: false, error: SOTTOSCRIZIONE_DEFUNTA }
    }

    logger.error('Invio Web Push fallito', {
      statusCode: errore.statusCode,
      body: errore.body,
      message: errore.message,
    })

    return {
      success: false,
      error: errore.body || errore.message || 'Errore sconosciuto',
    }
  }
}

/**
 * Invia la stessa notifica a più dispositivi. I risultati tornano nello stesso
 * ordine delle sottoscrizioni ricevute.
 */
export async function inviaPushMultiplo(
  sottoscrizioni: SottoscrizionePush[],
  payload: PushPayload
): Promise<NotificationResult[]> {
  return Promise.all(sottoscrizioni.map((s) => inviaPush(s, payload)))
}

/**
 * Il canale è configurato? Riesportato qui per comodità dei chiamanti.
 */
export { isPushConfigured, getVapidPublicKey } from './vapid'
