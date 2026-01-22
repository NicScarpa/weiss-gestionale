'use client'

import {
  getPendingClosures,
  updatePendingClosureStatus,
  deletePendingClosure,
  cacheData,
  hasPendingSync,
  getPendingCount,
} from './db'

import { logger } from '@/lib/logger'
// Sync status type
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

// Event types for sync updates
type SyncEventType = 'sync-start' | 'sync-progress' | 'sync-complete' | 'sync-error' | 'online' | 'offline'

interface SyncEvent {
  type: SyncEventType
  data?: {
    total?: number
    synced?: number
    error?: string
  }
}

// Sync event listeners
const syncListeners: Set<(event: SyncEvent) => void> = new Set()

export function addSyncListener(listener: (event: SyncEvent) => void) {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}

function notifySyncListeners(event: SyncEvent) {
  syncListeners.forEach((listener) => listener(event))
}

// Online/offline detection
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

export function getOnlineStatus() {
  return isOnline
}

// Initialize online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true
    notifySyncListeners({ type: 'online' })
    // Automatically trigger sync when coming back online
    syncPendingData()
  })

  window.addEventListener('offline', () => {
    isOnline = false
    notifySyncListeners({ type: 'offline' })
  })

  // Listen for service worker sync messages
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_CLOSURES') {
      syncPendingData()
    }
  })
}

// Sync pending closures to server
export async function syncPendingData(): Promise<{ success: boolean; synced: number; errors: number }> {
  if (!isOnline) {
    return { success: false, synced: 0, errors: 0 }
  }

  const pending = await getPendingClosures()

  if (pending.length === 0) {
    return { success: true, synced: 0, errors: 0 }
  }

  notifySyncListeners({
    type: 'sync-start',
    data: { total: pending.length },
  })

  let synced = 0
  let errors = 0

  for (const item of pending) {
    try {
      await updatePendingClosureStatus(item.id, 'syncing')

      // Submit the closure to the server
      const response = await fetch('/api/chiusure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data),
      })

      if (response.ok) {
        await deletePendingClosure(item.id)
        synced++
        notifySyncListeners({
          type: 'sync-progress',
          data: { total: pending.length, synced },
        })
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        await updatePendingClosureStatus(item.id, 'error', errorData.error)
        errors++
      }
    } catch (error) {
      await updatePendingClosureStatus(
        item.id,
        'error',
        error instanceof Error ? error.message : 'Network error'
      )
      errors++
    }
  }

  const success = errors === 0

  notifySyncListeners({
    type: success ? 'sync-complete' : 'sync-error',
    data: { total: pending.length, synced },
  })

  return { success, synced, errors }
}

// Pre-cache data for offline use
export async function prefetchDataForOffline() {
  if (!isOnline) return

  try {
    // Fetch and cache venues
    const venuesRes = await fetch('/api/venues')
    if (venuesRes.ok) {
      const { venues } = await venuesRes.json()
      await cacheData('cachedVenues', venues)
    }

    // Fetch and cache suppliers
    const suppliersRes = await fetch('/api/suppliers?full=true')
    if (suppliersRes.ok) {
      const { suppliers } = await suppliersRes.json()
      await cacheData('cachedSuppliers', suppliers)
    }

    // Fetch and cache accounts
    const accountsRes = await fetch('/api/accounts?full=true')
    if (accountsRes.ok) {
      const { accounts } = await accountsRes.json()
      await cacheData('cachedAccounts', accounts)
    }

    // Fetch and cache recent closures
    const closuresRes = await fetch('/api/chiusure?limit=50')
    if (closuresRes.ok) {
      const { chiusure } = await closuresRes.json()
      await cacheData('cachedClosures', chiusure)
    }

    logger.info('[Offline] Data prefetched successfully')
  } catch (error) {
    logger.error('[Offline] Error prefetching data', error)
  }
}

// Request background sync (if supported)
export async function requestBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready
      await (registration as any).sync.register('sync-closures')
    } catch (error) {
      logger.error('[Offline] Background sync registration failed', error)
    }
  }
}

// Export utility functions
export { hasPendingSync, getPendingCount }
