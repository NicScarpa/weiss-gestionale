/**
 * Notification Sending Service
 *
 * Gestisce l'invio di notifiche attraverso diversi canali (push, email, in-app)
 * e il logging delle notifiche inviate.
 */

import { prisma } from '@/lib/prisma'
import { inviaPushMultiplo, SOTTOSCRIZIONE_DEFUNTA } from './web-push'
import {
  sottoscrizioniAttive,
  sottoscrizioniAttiveDi,
  disattivaSottoscrizione,
  type SottoscrizionePush,
} from './subscriptions'
import type { NotificationLog, NotificationType } from '@prisma/client'
import {
  NotificationPayload,
  SendNotificationOptions,
  SendBulkNotificationOptions,
  NotificationResult,
  BulkNotificationResult,
  PushPayload,
  NotificationChannel,
} from './types'

import { logger } from '@/lib/logger'

/** Nessun browser registrato per quella persona: l'avviso resta solo in-app. */
const NESSUN_DISPOSITIVO = 'Nessun dispositivo registrato'

/**
 * Invia una notifica a un singolo utente
 */
export async function sendNotification(
  options: SendNotificationOptions
): Promise<NotificationResult> {
  const { userId, payload, channels = ['PUSH'] } = options
  const results: NotificationResult[] = []

  // Ottieni preferenze utente
  const preferences = await prisma.notificationPreference.findUnique({
    where: { userId },
  })

  // Controlla se l'utente ha abilitato le notifiche per questo tipo
  if (!shouldSendNotification(payload.type, preferences)) {
    return { success: true, messageId: 'skipped-preferences' }
  }

  // Invia tramite i canali richiesti
  for (const channel of channels) {
    if (channel === 'PUSH' && preferences?.pushEnabled !== false) {
      const result = await sendPushToUser(userId, payload)
      results.push(result)

      // Log notifica
      await logNotification({
        userId,
        payload,
        channel: 'PUSH',
        result,
      })
    }

    if (channel === 'EMAIL' && preferences?.emailEnabled) {
      // TODO: Implementare invio email
      logger.info('[Email] Would send to user', { userId, title: payload.title })
    }
  }

  // Ritorna il risultato aggregato
  const success = results.some((r) => r.success)
  return {
    success,
    messageId: results.find((r) => r.messageId)?.messageId,
    error: success ? undefined : results.map((r) => r.error).join(', '),
  }
}

/**
 * Invia una notifica a più utenti
 */
export async function sendBulkNotification(
  options: SendBulkNotificationOptions
): Promise<BulkNotificationResult> {
  const { userIds, payload, channels = ['PUSH'] } = options

  const results: BulkNotificationResult['results'] = []
  let successCount = 0
  let failureCount = 0

  // Ottieni preferenze di tutti gli utenti
  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
  })
  const prefsMap = new Map(preferences.map((p) => [p.userId, p]))

  // Filtra utenti che vogliono ricevere questa notifica
  const eligibleUserIds = userIds.filter((userId) => {
    const prefs = prefsMap.get(userId)
    return shouldSendNotification(payload.type, prefs)
  })

  if (channels.includes('PUSH')) {
    const subscriptions = await sottoscrizioniAttiveDi(eligibleUserIds)

    const sottoscrizioniPerUtente = new Map<string, SottoscrizionePush[]>()
    for (const sub of subscriptions) {
      const lista = sottoscrizioniPerUtente.get(sub.userId)
      if (lista) {
        lista.push(sub)
      } else {
        sottoscrizioniPerUtente.set(sub.userId, [sub])
      }
    }

    const corpo = componiPushPayload(payload)

    // Si itera sui destinatari, non sulle sottoscrizioni: chi non ha un
    // dispositivo registrato deve comunque trovare l'avviso nella campanella
    // dell'app. Iterando sulle sottoscrizioni la notifica spariva senza
    // lasciare traccia, e chi aveva tre dispositivi la vedeva tre volte.
    for (const userId of eligibleUserIds) {
      const sottoscrizioni = sottoscrizioniPerUtente.get(userId) ?? []

      if (sottoscrizioni.length === 0) {
        const result = { success: false, error: NESSUN_DISPOSITIVO }
        failureCount++
        results.push({ userId, success: false, error: NESSUN_DISPOSITIVO })
        await logNotification({ userId, payload, channel: 'PUSH', result })
        continue
      }

      const esiti = await inviaPushMultiplo(sottoscrizioni, corpo)

      for (let i = 0; i < esiti.length; i++) {
        if (esiti[i].error === SOTTOSCRIZIONE_DEFUNTA) {
          await disattivaSottoscrizione(sottoscrizioni[i].id)
        }
      }

      // Basta un dispositivo raggiunto perché la persona sia stata avvisata:
      // un solo esito e un solo log per destinatario.
      const riuscito = esiti.find((e) => e.success)
      if (riuscito) {
        successCount++
        results.push({ userId, success: true })
      } else {
        failureCount++
        results.push({
          userId,
          success: false,
          error: esiti.map((e) => e.error).join(', '),
        })
      }

      await logNotification({
        userId,
        payload,
        channel: 'PUSH',
        result: riuscito ?? esiti[0],
      })
    }
  }

  return {
    successCount,
    failureCount,
    results,
  }
}

/**
 * Invia push notification a un utente
 */
async function sendPushToUser(
  userId: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const subscriptions: SottoscrizionePush[] = await sottoscrizioniAttive(userId)

  if (subscriptions.length === 0) {
    return { success: false, error: NESSUN_DISPOSITIVO }
  }

  const results = await inviaPushMultiplo(subscriptions, componiPushPayload(payload))

  // Le sottoscrizioni revocate dal browser non torneranno valide: vanno spente.
  for (let i = 0; i < results.length; i++) {
    if (results[i].error === SOTTOSCRIZIONE_DEFUNTA) {
      await disattivaSottoscrizione(subscriptions[i].id)
    }
  }

  // Almeno un invio riuscito?
  const success = results.some((r) => r.success)
  return {
    success,
    messageId: results.find((r) => r.messageId)?.messageId,
    error: success ? undefined : results.map((r) => r.error).join(', '),
  }
}

/**
 * Traduce la notifica applicativa nel corpo che viaggia sul canale push.
 * La forma è quella che il service worker legge in `event.data.json()`:
 * `data.url` è ciò che determina dove atterra l'utente al click.
 *
 * I campi di sistema vengono dopo lo spread di `data`: un payload arbitrario
 * non deve poter dirottare l'url del click. Quelli vuoti però non sovrascrivono
 * un valore già presente in `data`, che è l'ordine con cui `logNotification`
 * persiste la stessa notifica in-app.
 */
export function componiPushPayload(payload: NotificationPayload): PushPayload {
  return {
    title: payload.title,
    body: payload.body,
    type: payload.type,
    tag: payload.type,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: {
      referenceId: '',
      referenceType: '',
      url: '',
      ...payload.data,
      type: payload.type,
      ...(payload.referenceId ? { referenceId: payload.referenceId } : {}),
      ...(payload.referenceType ? { referenceType: payload.referenceType } : {}),
      ...(payload.url ? { url: payload.url } : {}),
    },
  }
}

/**
 * Verifica se inviare la notifica in base alle preferenze
 */
function shouldSendNotification(
  type: string,
  preferences: {
    pushEnabled?: boolean
    newShiftPublished?: boolean
    shiftReminder?: boolean
    shiftSwapRequest?: boolean
    anomalyCreated?: boolean
    anomalyResolved?: boolean
    leaveApproved?: boolean
    leaveRejected?: boolean
    leaveReminder?: boolean
    newLeaveRequest?: boolean
    correctionApproved?: boolean
    correctionRejected?: boolean
    newCorrectionRequest?: boolean
    clockReminder?: boolean
    companyCommunication?: boolean
    staffAnomaly?: boolean
    newDocument?: boolean
  } | null | undefined
): boolean {
  // Se non ci sono preferenze, usa i default (tutte abilitate)
  if (!preferences) return true

  // Mappa tipo notifica -> preferenza
  const prefsMap: Record<string, boolean | undefined> = {
    SHIFT_PUBLISHED: preferences.newShiftPublished,
    SHIFT_REMINDER: preferences.shiftReminder,
    SHIFT_SWAP_REQUEST: preferences.shiftSwapRequest,
    SHIFT_SWAP_APPROVED: preferences.shiftSwapRequest,
    SHIFT_SWAP_REJECTED: preferences.shiftSwapRequest,
    ANOMALY_CREATED: preferences.anomalyCreated,
    ANOMALY_RESOLVED: preferences.anomalyResolved,
    LEAVE_APPROVED: preferences.leaveApproved,
    LEAVE_REJECTED: preferences.leaveRejected,
    LEAVE_REMINDER: preferences.leaveReminder,
    NEW_LEAVE_REQUEST: preferences.newLeaveRequest,
    CORRECTION_APPROVED: preferences.correctionApproved,
    CORRECTION_REJECTED: preferences.correctionRejected,
    NEW_CORRECTION_REQUEST: preferences.newCorrectionRequest,
    CLOCK_REMINDER: preferences.clockReminder,
    COMPANY_COMMUNICATION: preferences.companyCommunication,
    STAFF_ANOMALY: preferences.staffAnomaly,
    NEW_DOCUMENT: preferences.newDocument,
    GENERAL: true, // Sempre abilitate
  }

  return prefsMap[type] !== false
}

/**
 * Logga una notifica nel database
 */
async function logNotification(params: {
  userId: string
  payload: NotificationPayload
  channel: NotificationChannel
  result: NotificationResult
}): Promise<void> {
  const { userId, payload, channel, result } = params

  try {
    await prisma.notificationLog.create({
      data: {
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        // L'url viene persistito insieme ai data così la UI in-app può linkare la notifica
        data: payload.url ? { ...payload.data, url: payload.url } : payload.data || undefined,
        channel,
        status: result.success ? 'SENT' : 'FAILED',
        errorMsg: result.error || undefined,
        referenceId: payload.referenceId || undefined,
        referenceType: payload.referenceType || undefined,
      },
    })
  } catch (error) {
    logger.error('Failed to log notification', error)
  }
}

/**
 * Segna una notifica come letta
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<void> {
  await prisma.notificationLog.update({
    where: { id: notificationId },
    data: {
      readAt: new Date(),
      status: 'READ',
    },
  })
}

/**
 * Ottieni notifiche non lette per un utente
 */
export async function getUnreadNotifications(
  userId: string,
  limit = 20
): Promise<NotificationLog[]> {
  return prisma.notificationLog.findMany({
    where: {
      userId,
      readAt: null,
    },
    orderBy: { sentAt: 'desc' },
    take: limit,
  })
}

/**
 * Ottieni storico notifiche per un utente
 */
export async function getNotificationHistory(
  userId: string,
  options: {
    limit?: number
    offset?: number
    type?: string
  } = {}
): Promise<NotificationLog[]> {
  const { limit = 50, offset = 0, type } = options

  return prisma.notificationLog.findMany({
    where: {
      userId,
      ...(type ? { type: type as NotificationType } : {}),
    },
    orderBy: { sentAt: 'desc' },
    take: limit,
    skip: offset,
  })
}
