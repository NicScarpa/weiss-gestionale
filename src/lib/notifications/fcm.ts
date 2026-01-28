/**
 * Firebase Cloud Messaging Service
 *
 * Gestisce l'invio di notifiche push tramite Firebase Cloud Messaging.
 * Richiede le variabili ambiente:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_PRIVATE_KEY
 * - FIREBASE_CLIENT_EMAIL
 */

import { FCMMessage, NotificationResult } from './types'

import { logger } from '@/lib/logger'
// Firebase Admin SDK (lazy loaded)
let firebaseApp: FirebaseApp | null = null
let messaging: Messaging | null = null

// Type definitions per evitare import diretti (firebase-admin is lazy loaded)
interface FirebaseApp {
  name: string
}

interface SendResponse {
  success: boolean
  messageId?: string
  error?: { message?: string }
}

interface Messaging {
  send(message: Record<string, unknown>, dryRun?: boolean): Promise<string>
  sendEach(messages: Record<string, unknown>[]): Promise<{ responses: SendResponse[] }>
}

/**
 * Inizializza Firebase Admin SDK
 */
async function initializeFirebase(): Promise<boolean> {
  if (firebaseApp) return true

  // Verifica credenziali
  const projectId = process.env.FIREBASE_PROJECT_ID
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL

  if (!projectId || !privateKey || !clientEmail) {
    logger.warn(
      'Firebase credentials not configured. Push notifications disabled.'
    )
    return false
  }

  try {
    // Dynamic import per evitare errori se firebase-admin non è installato
    const admin = await import('firebase-admin')

    if (!admin.apps.length) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey,
          clientEmail,
        }),
      })
    } else {
      firebaseApp = admin.apps[0]
    }

    messaging = admin.messaging() as unknown as Messaging
    logger.info('Firebase Admin SDK initialized')
    return true
  } catch (error) {
    logger.error('Failed to initialize Firebase', error)
    return false
  }
}

/**
 * Invia una notifica push a un dispositivo
 */
export async function sendPushNotification(
  message: FCMMessage
): Promise<NotificationResult> {
  const initialized = await initializeFirebase()

  if (!initialized || !messaging) {
    // In development senza Firebase, logga e ritorna success mock
    if (process.env.NODE_ENV === 'development') {
      logger.info('[FCM Mock] Would send', { message })
      return { success: true, messageId: 'mock-' + Date.now() }
    }
    return { success: false, error: 'Firebase not configured' }
  }

  try {
    const messageId = await messaging.send({
      token: message.token,
      notification: {
        title: message.notification.title,
        body: message.notification.body,
      },
      data: message.data,
      webpush: message.webpush || {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
        },
      },
    })

    return { success: true, messageId }
  } catch (error: unknown) {
    logger.error('FCM send error', error)

    // Gestisci token non valido
    const fcmError = error as { code?: string; message?: string }
    if (
      fcmError.code === 'messaging/invalid-registration-token' ||
      fcmError.code === 'messaging/registration-token-not-registered'
    ) {
      return {
        success: false,
        error: 'invalid_token',
      }
    }

    return {
      success: false,
      error: fcmError.message || 'Unknown error',
    }
  }
}

/**
 * Invia notifiche push a più dispositivi
 */
export async function sendPushNotificationBatch(
  messages: FCMMessage[]
): Promise<NotificationResult[]> {
  const initialized = await initializeFirebase()

  if (!initialized || !messaging) {
    if (process.env.NODE_ENV === 'development') {
      logger.info('[FCM Mock] Would send batch', { count: messages.length })
      return messages.map(() => ({ success: true, messageId: 'mock-' + Date.now() }))
    }
    return messages.map(() => ({ success: false, error: 'Firebase not configured' }))
  }

  try {
    const fcmMessages = messages.map((msg) => ({
      token: msg.token,
      notification: {
        title: msg.notification.title,
        body: msg.notification.body,
      },
      data: msg.data,
      webpush: msg.webpush || {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
        },
      },
    }))

    const response = await messaging.sendEach(fcmMessages)

    return response.responses.map((res: SendResponse) => {
      if (res.success) {
        return { success: true, messageId: res.messageId }
      } else {
        return {
          success: false,
          error: res.error?.message || 'Unknown error',
        }
      }
    })
  } catch (error: unknown) {
    logger.error('FCM batch send error', error)
    return messages.map(() => ({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }))
  }
}

/**
 * Verifica se un token FCM è valido
 */
export async function validateFCMToken(token: string): Promise<boolean> {
  const initialized = await initializeFirebase()

  if (!initialized || !messaging) {
    // In development, considera valido
    return process.env.NODE_ENV === 'development'
  }

  try {
    // Invia un messaggio "dry run" per verificare il token
    await messaging.send(
      {
        token,
        data: { test: 'true' },
      },
      true // dryRun
    )
    return true
  } catch {
    return false
  }
}

/**
 * Controlla se Firebase è configurato
 */
export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL
  )
}
