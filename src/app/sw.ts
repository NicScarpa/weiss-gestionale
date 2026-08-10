/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'
import { ExpirationPlugin, NetworkFirst, NetworkOnly } from 'serwist'
import { INTESTAZIONE_RISCALDAMENTO, NOME_CACHE_PAGINE } from '@/lib/offline/cache-pagine'

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

// Ensure API routes use NetworkOnly (no caching)
const apiNetworkOnly = {
  matcher: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
  handler: new NetworkOnly(),
}

/**
 * Le pagine hanno una cache loro, e non è una rifinitura.
 *
 * `defaultCache` di `@serwist/next` contiene una regola che *sembra* fatta per
 * le pagine, ma seleziona su `request.headers.get("Content-Type")`: è un header
 * di **richiesta**, e una navigazione non lo manda mai (manda `Accept`). Quella
 * regola quindi non scatta su nessuna navigazione — verificato: la cache che
 * dovrebbe creare non esiste affatto, le uniche presenti sono il precache e
 * `others`.
 *
 * Il risultato è che ogni documento finiva in `others`, l'ultima regola prima
 * del rifiuto: un `NetworkFirst` con **32 voci in LRU condivise con tutte le
 * altre risorse** della stessa origine. In un browser appena aperto non si
 * nota, perché c'è una voce sola; su un telefono che ha navigato un po', la
 * pagina che serve senza rete compete per uno di 32 posti con tutto il resto —
 * e chi la perde si vede «Sei offline» al posto del modulo che stava
 * compilando.
 *
 * La selezione prende DUE cose, e la seconda non è un di più: la navigazione
 * (`request.mode === 'navigate'`), che è il reload senza rete, e la richiesta
 * di riscaldamento, che è una `fetch()` programmatica e quindi navigazione non
 * è. Selezionare solo le prime significa **leggere da una cache che nessuno
 * riempie**: misurato, otto fallimenti su otto. Il perché per esteso sta in
 * `cache-pagine.ts`, insieme al motivo per cui non si risolve scrivendo la
 * pagina a mano da entrambe le parti.
 *
 * La regola sta **prima** di `others` perché l'ordine è quello di valutazione.
 * Cinquanta voci: i documenti sono pochi e piccoli, e ora non gareggiano più
 * con gli asset.
 */
const navigazioni = {
  matcher: ({ request }: { request: Request }) =>
    request.mode === 'navigate' || request.headers.get(INTESTAZIONE_RISCALDAMENTO) === '1',
  handler: new NetworkFirst({
    cacheName: NOME_CACHE_PAGINE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60,
      }),
    ],
  }),
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // L'ordine è quello di valutazione: le API per prime (mai in cache), poi le
  // navigazioni, poi il resto. `navigazioni` deve stare prima di `defaultCache`
  // perché è lì dentro che vive `others`, il secchio che finora se le prendeva.
  runtimeCaching: [apiNetworkOnly, navigazioni, ...defaultCache],
  // `/offline` è nel precache (serwist.config.mjs): il fallback lo cerca lì, e
  // finché non c'era non scattava mai.
  //
  // Il `matcher` non è una rifinitura: Serwist attacca questo fallback a TUTTE
  // le regole di runtime caching, `apiNetworkOnly` compresa. Senza il filtro
  // sul documento, una POST a /api/chiusure fatta senza rete non fallirebbe —
  // si prenderebbe la pagina «Sei offline» con stato 200, e chi l'ha chiamata
  // crederebbe di aver salvato.
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
