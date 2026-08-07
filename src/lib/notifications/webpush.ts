import webpush from 'web-push'
import { logger } from '@/lib/logger'
import type { NotificationPayload, NotificationResult } from './types'

/**
 * Notifiche push via Web Push standard (VAPID).
 *
 * Il protocollo è quello dei browser: nessun servizio di terze parti da
 * configurare, nessuna dipendenza da Google. Le chiavi VAPID identificano
 * il mittente e si generano una volta sola:
 *
 *   npx web-push generate-vapid-keys
 *
 * - `VAPID_PUBLIC_KEY`  va anche al browser, non è un segreto
 * - `VAPID_PRIVATE_KEY` è un segreto: solo server
 * - `VAPID_SUBJECT`     un mailto: di contatto, richiesto dallo standard
 *
 * Senza chiavi il modulo non finge di aver inviato: risponde con un errore,
 * così chi chiama può registrarlo e il silenzio non passa per successo.
 */

export interface WebPushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Il corpo della notifica, nella forma che il service worker legge in
 * `src/app/sw.ts`: `title`, `body`, `tag` e `data.url` sono i campi da cui
 * dipendono il testo mostrato e la pagina che si apre al clic.
 */
export function buildPushPayload(payload: NotificationPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.type,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: {
      ...payload.data,
      type: payload.type,
      url: payload.url ?? '',
      referenceId: payload.referenceId ?? '',
      referenceType: payload.referenceType ?? '',
    },
  })
}

/** Configura le chiavi VAPID. False se non sono state impostate. */
function configuraVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:info@weisscafe.com'

  if (!publicKey || !privateKey) {
    return false
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

/**
 * Gli stati con cui il browser dice che quel dispositivo non esiste più:
 * l'utente ha revocato il permesso, disinstallato la PWA o pulito i dati.
 * Vanno distinti dagli errori temporanei, che non devono far buttare via
 * l'iscrizione.
 */
const STATI_ISCRIZIONE_MORTA = [404, 410]

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: NotificationPayload
): Promise<NotificationResult> {
  if (!configuraVapid()) {
    logger.warn('Chiavi VAPID non configurate: notifica push non inviata')
    return { success: false, error: 'Chiavi VAPID non configurate' }
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      buildPushPayload(payload)
    )

    return { success: true, messageId: subscription.endpoint.slice(-12) }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode !== undefined && STATI_ISCRIZIONE_MORTA.includes(statusCode)) {
      return { success: false, error: 'invalid_token' }
    }

    const body = (error as { body?: string }).body
    logger.error('Invio push fallito', { statusCode, body })
    return {
      success: false,
      error: body || (error as Error).message || 'Invio push fallito',
    }
  }
}

/**
 * Invia a più dispositivi. Il fallimento di uno non ferma gli altri: un
 * telefono con l'iscrizione scaduta non deve impedire l'avviso a chi c'è.
 */
export async function sendWebPushBatch(
  subscriptions: WebPushSubscription[],
  payload: NotificationPayload
): Promise<NotificationResult[]> {
  return Promise.all(subscriptions.map((s) => sendWebPush(s, payload)))
}

/** La chiave pubblica da consegnare al browser per iscriversi. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}
