/**
 * Notification Sending Service
 *
 * Gestisce l'invio di notifiche attraverso diversi canali (push, email, in-app)
 * e il logging delle notifiche inviate.
 */

import { prisma } from '@/lib/prisma'
import { sendPushNotification, sendPushNotificationBatch, isFirebaseConfigured } from './fcm'
import type { NotificationLog, NotificationType } from '@prisma/client'
import {
  NotificationPayload,
  SendNotificationOptions,
  SendBulkNotificationOptions,
  NotificationResult,
  BulkNotificationResult,
  FCMMessage,
  NotificationChannel,
  NotificationStatus,
} from './types'

import { logger } from '@/lib/logger'
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
    // Ottieni token FCM per tutti gli utenti
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        userId: { in: eligibleUserIds },
        isActive: true,
      },
    })

    if (subscriptions.length > 0) {
      const messages: FCMMessage[] = subscriptions.map((sub) => ({
        token: sub.fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          type: payload.type,
          referenceId: payload.referenceId || '',
          referenceType: payload.referenceType || '',
          url: payload.url || '',
          ...payload.data,
        },
        webpush: {
          fcmOptions: {
            link: payload.url,
          },
        },
      }))

      const pushResults = await sendPushNotificationBatch(messages)

      // Processa risultati e logga
      for (let i = 0; i < subscriptions.length; i++) {
        const sub = subscriptions[i]
        const result = pushResults[i]

        if (result.success) {
          successCount++
          results.push({ userId: sub.userId, success: true })
        } else {
          failureCount++
          results.push({ userId: sub.userId, success: false, error: result.error })

          // Disattiva token non valido
          if (result.error === 'invalid_token') {
            await prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { isActive: false },
            })
          }
        }

        // Log notifica
        await logNotification({
          userId: sub.userId,
          payload,
          channel: 'PUSH',
          result,
        })
      }
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
  // Ottieni token FCM attivi dell'utente
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId,
      isActive: true,
    },
  })

  if (subscriptions.length === 0) {
    return { success: false, error: 'No active push subscriptions' }
  }

  // Invia a tutti i dispositivi dell'utente
  const messages: FCMMessage[] = subscriptions.map((sub) => ({
    token: sub.fcmToken,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      type: payload.type,
      referenceId: payload.referenceId || '',
      referenceType: payload.referenceType || '',
      url: payload.url || '',
      ...payload.data,
    },
    webpush: {
      fcmOptions: {
        link: payload.url,
      },
    },
  }))

  const results = await sendPushNotificationBatch(messages)

  // Disattiva token non validi
  for (let i = 0; i < results.length; i++) {
    if (results[i].error === 'invalid_token') {
      await prisma.pushSubscription.update({
        where: { id: subscriptions[i].id },
        data: { isActive: false },
      })
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
    staffAnomaly?: boolean
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
    STAFF_ANOMALY: preferences.staffAnomaly,
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
        data: payload.data || undefined,
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
