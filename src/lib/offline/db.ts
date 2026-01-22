import { openDB, DBSchema, IDBPDatabase } from 'idb'

import { logger } from '@/lib/logger'
// Database schema
interface WeissDB extends DBSchema {
  // Pending closures to sync
  pendingClosures: {
    key: string
    value: {
      id: string
      data: any
      createdAt: Date
      status: 'pending' | 'syncing' | 'error'
      errorMessage?: string
      retryCount: number
    }
    indexes: { 'by-status': string }
  }
  // Cached closures for offline viewing
  cachedClosures: {
    key: string
    value: {
      id: string
      data: any
      cachedAt: Date
    }
  }
  // Cached venues
  cachedVenues: {
    key: string
    value: {
      id: string
      data: any
      cachedAt: Date
    }
  }
  // Cached staff
  cachedStaff: {
    key: string
    value: {
      id: string
      data: any
      cachedAt: Date
    }
  }
  // Cached accounts
  cachedAccounts: {
    key: string
    value: {
      id: string
      data: any
      cachedAt: Date
    }
  }
  // Cached suppliers
  cachedSuppliers: {
    key: string
    value: {
      id: string
      data: any
      cachedAt: Date
    }
  }
  // Sync metadata
  syncMeta: {
    key: string
    value: {
      key: string
      lastSync: Date
      version: number
    }
  }
}

const DB_NAME = 'weiss-gestionale'
const DB_VERSION = 1

let dbInstance: IDBPDatabase<WeissDB> | null = null

export async function getDB(): Promise<IDBPDatabase<WeissDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<WeissDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Pending closures store
      if (!db.objectStoreNames.contains('pendingClosures')) {
        const pendingStore = db.createObjectStore('pendingClosures', { keyPath: 'id' })
        pendingStore.createIndex('by-status', 'status')
      }

      // Cached data stores
      if (!db.objectStoreNames.contains('cachedClosures')) {
        db.createObjectStore('cachedClosures', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('cachedVenues')) {
        db.createObjectStore('cachedVenues', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('cachedStaff')) {
        db.createObjectStore('cachedStaff', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('cachedAccounts')) {
        db.createObjectStore('cachedAccounts', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('cachedSuppliers')) {
        db.createObjectStore('cachedSuppliers', { keyPath: 'id' })
      }

      // Sync metadata
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'key' })
      }
    },
  })

  return dbInstance
}

// Pending closures operations
export async function savePendingClosure(data: any): Promise<string> {
  const db = await getDB()
  const id = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  await db.put('pendingClosures', {
    id,
    data,
    createdAt: new Date(),
    status: 'pending',
    retryCount: 0,
  })

  return id
}

export async function getPendingClosures() {
  const db = await getDB()
  return db.getAllFromIndex('pendingClosures', 'by-status', 'pending')
}

export async function updatePendingClosureStatus(
  id: string,
  status: 'pending' | 'syncing' | 'error',
  errorMessage?: string
) {
  const db = await getDB()
  const closure = await db.get('pendingClosures', id)

  if (closure) {
    await db.put('pendingClosures', {
      ...closure,
      status,
      errorMessage,
      retryCount: status === 'error' ? closure.retryCount + 1 : closure.retryCount,
    })
  }
}

export async function deletePendingClosure(id: string) {
  const db = await getDB()
  await db.delete('pendingClosures', id)
}

// Cache operations
export async function cacheData<T extends 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers'>(
  store: T,
  items: Array<{ id: string; [key: string]: any }> | undefined | null
) {
  // Guard against undefined/null items
  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.warn(`[Offline] No items to cache for store: ${store}`)
    return
  }

  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')

  await Promise.all([
    ...items.map((item) =>
      tx.store.put({
        id: item.id,
        data: item,
        cachedAt: new Date(),
      })
    ),
    tx.done,
  ])

  // Update sync metadata
  await db.put('syncMeta', {
    key: store,
    lastSync: new Date(),
    version: DB_VERSION,
  })
}

export async function getCachedData<T>(
  store: 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers'
): Promise<T[]> {
  const db = await getDB()
  const items = await db.getAll(store)
  return items.map((item) => item.data as T)
}

export async function getCachedItem<T>(
  store: 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers',
  id: string
): Promise<T | undefined> {
  const db = await getDB()
  const item = await db.get(store, id)
  return item?.data as T | undefined
}

export async function clearCache(store?: 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers') {
  const db = await getDB()

  if (store) {
    await db.clear(store)
  } else {
    await Promise.all([
      db.clear('cachedClosures'),
      db.clear('cachedVenues'),
      db.clear('cachedStaff'),
      db.clear('cachedAccounts'),
      db.clear('cachedSuppliers'),
    ])
  }
}

// Get sync status
export async function getSyncMeta(store: string) {
  const db = await getDB()
  return db.get('syncMeta', store)
}

// Check if we have pending items to sync
export async function hasPendingSync(): Promise<boolean> {
  const pending = await getPendingClosures()
  return pending.length > 0
}

// Get pending count
export async function getPendingCount(): Promise<number> {
  const pending = await getPendingClosures()
  return pending.length
}
