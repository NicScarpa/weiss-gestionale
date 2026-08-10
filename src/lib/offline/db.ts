import { openDB, DBSchema, IDBPDatabase } from 'idb'

import { logger } from '@/lib/logger'
// Database schema
interface WeissDB extends DBSchema {
  // Pending closures to sync
  pendingClosures: {
    key: string
    value: {
      id: string
      data: unknown
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
      data: unknown
      cachedAt: Date
    }
  }
  // Cached venues
  cachedVenues: {
    key: string
    value: {
      id: string
      data: unknown
      cachedAt: Date
    }
  }
  // Cached staff
  cachedStaff: {
    key: string
    value: {
      id: string
      data: unknown
      cachedAt: Date
    }
  }
  // Cached accounts
  cachedAccounts: {
    key: string
    value: {
      id: string
      data: unknown
      cachedAt: Date
    }
  }
  // Cached suppliers
  cachedSuppliers: {
    key: string
    value: {
      id: string
      data: unknown
      cachedAt: Date
    }
  }
  // Cached cost centers (piano dei conti v4)
  costCenters: {
    key: string
    value: {
      id: string
      data: unknown
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
// v2: nuovo store costCenters e conti arricchiti di mastro/gruppo/costCenterRule
// (piano dei conti v4). Il bump forza la risincronizzazione su ogni dispositivo.
const DB_VERSION = 2

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
      if (!db.objectStoreNames.contains('costCenters')) {
        db.createObjectStore('costCenters', { keyPath: 'id' })
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

/** Una chiusura che aspetta di arrivare al server. */
export type ChiusuraInCoda = WeissDB['pendingClosures']['value']

/**
 * Quante volte si riprova a inviare una chiusura prima di smettere.
 *
 * Smettere non vuol dire buttarla: la riga resta in coda e resta contata,
 * perché contiene il conteggio di cassa di una serata e non spetta al codice
 * decidere di perderlo. Il limite serve solo a non ribattere sul server, a ogni
 * riconnessione e per sempre, un errore che da sé non cambierà.
 */
export const MAX_TENTATIVI_INVIO = 5

export async function savePendingClosure(data: unknown): Promise<string> {
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

/**
 * Tutto ciò che non è ancora arrivato al server, in qualunque stato: in attesa,
 * in invio, o rifiutato.
 *
 * Il numero mostrato all'utente si legge da qui e non dal solo stato `pending`:
 * una chiusura che il server ha rifiutato uscirebbe dal contatore pur restando
 * in IndexedDB, e l'utente vedrebbe «0 da sincronizzare» sopra un lavoro mai
 * consegnato. È la stessa promessa non mantenuta, spostata di un passo.
 */
export async function getQueuedClosures(): Promise<ChiusuraInCoda[]> {
  const db = await getDB()
  return db.getAll('pendingClosures')
}

/** Le righe che ha senso provare a inviare adesso. */
export async function getSyncableClosures(): Promise<ChiusuraInCoda[]> {
  const inCoda = await getQueuedClosures()
  return inCoda.filter(
    (riga) =>
      riga.status === 'pending' ||
      (riga.status === 'error' && riga.retryCount < MAX_TENTATIVI_INVIO)
  )
}

/** Le righe che hanno esaurito i tentativi: le deve guardare una persona. */
export async function getBlockedClosures(): Promise<ChiusuraInCoda[]> {
  const inCoda = await getQueuedClosures()
  return inCoda.filter(
    (riga) => riga.status === 'error' && riga.retryCount >= MAX_TENTATIVI_INVIO
  )
}

/**
 * Rimette in attesa le righe ferme in `syncing`.
 *
 * Ci restano quando la scheda viene chiusa a metà invio — cioè proprio la sera
 * in cui la connessione balla. `syncing` non è uno stato da cui qualcuno
 * riparta: senza questo, quelle righe resterebbero contate e mai più inviate.
 * Si chiama all'inizio di ogni giro, quando per costruzione nessun invio è in
 * corso.
 */
export async function requeueStalledClosures(): Promise<number> {
  const db = await getDB()
  const ferme = (await getQueuedClosures()).filter((riga) => riga.status === 'syncing')

  for (const riga of ferme) {
    await db.put('pendingClosures', { ...riga, status: 'pending' })
  }

  return ferme.length
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

/**
 * Ferma i tentativi su una riga che il server continuerà a rifiutare (una data
 * già chiusa, dati che non passano la validazione). La riga resta, con il
 * motivo scritto sopra: è l'unico modo perché qualcuno possa rimediare.
 */
export async function blockPendingClosure(id: string, errorMessage: string) {
  const db = await getDB()
  const closure = await db.get('pendingClosures', id)

  if (closure) {
    await db.put('pendingClosures', {
      ...closure,
      status: 'error',
      errorMessage,
      retryCount: MAX_TENTATIVI_INVIO,
    })
  }
}

export async function deletePendingClosure(id: string) {
  const db = await getDB()
  await db.delete('pendingClosures', id)
}

// Cache operations
export async function cacheData<T extends 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers' | 'costCenters'>(
  store: T,
  items: Array<{ id: string; [key: string]: unknown }> | undefined | null
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
  store: 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers' | 'costCenters'
): Promise<T[]> {
  const db = await getDB()
  const items = await db.getAll(store)
  return items.map((item) => item.data as T)
}

export async function getCachedItem<T>(
  store: 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers' | 'costCenters',
  id: string
): Promise<T | undefined> {
  const db = await getDB()
  const item = await db.get(store, id)
  return item?.data as T | undefined
}

export async function clearCache(store?: 'cachedClosures' | 'cachedVenues' | 'cachedStaff' | 'cachedAccounts' | 'cachedSuppliers' | 'costCenters') {
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
      db.clear('costCenters'),
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
  const inCoda = await getQueuedClosures()
  return inCoda.length > 0
}

// Get pending count
export async function getPendingCount(): Promise<number> {
  const inCoda = await getQueuedClosures()
  return inCoda.length
}
