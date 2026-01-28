/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

// Extend global scope with Serwist types
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Extended types for push notifications
interface NotificationAction {
  action: string
  title: string
  icon?: string
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()

// Background sync for offline form submissions
self.addEventListener('sync', (event: ExtendableEvent & { tag: string }) => {
  if (event.tag === 'sync-closures') {
    event.waitUntil(syncPendingClosures())
  }
  if (event.tag === 'sync-punches') {
    event.waitUntil(syncPendingPunches())
  }
})

async function syncPendingClosures() {
  // This will be handled by the client-side sync mechanism
  // The service worker just triggers the sync event
  const clients = await self.clients.matchAll()
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_CLOSURES' })
  })
}

async function syncPendingPunches() {
  // Notify clients to sync pending punches
  const clients = await self.clients.matchAll()
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_PUNCHES' })
  })
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ==================== PUSH NOTIFICATIONS ====================

// Handle incoming push notifications
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return

  try {
    const data = event.data.json()

    const options: Record<string, unknown> = {
      body: data.body || data.notification?.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/badge-72.png',
      tag: data.tag || data.type || 'default',
      data: data.data || data,
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || getNotificationActions(data.type),
    }

    const title = data.title || data.notification?.title || 'Weiss Cafè'

    event.waitUntil(self.registration.showNotification(title, options))
  } catch (error) {
    console.error('Error showing push notification:', error)
  }
})

// Handle notification click
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  // Get the action clicked (if any)
  const action = event.action
  const data = event.notification.data || {}

  // Determine URL to open
  let url = data.url || '/'

  if (action === 'view') {
    url = data.url || getUrlForNotificationType(data.type, data)
  } else if (action === 'dismiss') {
    // Just close the notification
    return
  } else {
    // Default click behavior
    url = data.url || getUrlForNotificationType(data.type, data)
  }

  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if a window is already open
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: { ...data, url },
          })
          return
        }
      }
      // Open a new window if none is open
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})

// Handle notification close
self.addEventListener('notificationclose', (event: NotificationEvent) => {
  const data = event.notification.data || {}

  // Notify clients that notification was closed
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'NOTIFICATION_CLOSED',
        data,
      })
    })
  })
})

// Helper: Get notification actions based on type
function getNotificationActions(type: string): NotificationAction[] {
  const defaultActions: NotificationAction[] = [
    { action: 'view', title: 'Visualizza' },
    { action: 'dismiss', title: 'Ignora' },
  ]

  switch (type) {
    case 'SHIFT_PUBLISHED':
      return [
        { action: 'view', title: 'Vedi Turni' },
        { action: 'dismiss', title: 'Dopo' },
      ]
    case 'SHIFT_REMINDER':
      return [
        { action: 'view', title: 'Timbra' },
        { action: 'dismiss', title: 'Ok' },
      ]
    case 'ANOMALY_CREATED':
    case 'STAFF_ANOMALY':
      return [
        { action: 'view', title: 'Vedi Dettagli' },
        { action: 'dismiss', title: 'Dopo' },
      ]
    case 'LEAVE_APPROVED':
    case 'LEAVE_REJECTED':
      return [
        { action: 'view', title: 'Vedi Ferie' },
        { action: 'dismiss', title: 'Ok' },
      ]
    case 'NEW_LEAVE_REQUEST':
      return [
        { action: 'view', title: 'Gestisci' },
        { action: 'dismiss', title: 'Dopo' },
      ]
    default:
      return defaultActions
  }
}

// Helper: Get URL based on notification type
function getUrlForNotificationType(type: string, data: Record<string, string>): string {
  switch (type) {
    case 'SHIFT_PUBLISHED':
    case 'SHIFT_REMINDER':
      return '/portale/turni'
    case 'ANOMALY_CREATED':
    case 'ANOMALY_RESOLVED':
      return '/portale/presenze'
    case 'LEAVE_APPROVED':
    case 'LEAVE_REJECTED':
    case 'LEAVE_REMINDER':
      return '/portale/ferie'
    case 'NEW_LEAVE_REQUEST':
      return '/ferie'
    case 'STAFF_ANOMALY':
      return '/presenze/anomalie'
    default:
      return data.referenceType === 'ShiftSchedule'
        ? '/portale/turni'
        : data.referenceType === 'LeaveRequest'
          ? '/portale/ferie'
          : '/'
  }
}
