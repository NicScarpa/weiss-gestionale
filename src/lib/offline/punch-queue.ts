/**
 * Offline Punch Queue
 *
 * Gestisce le timbrature offline salvandole in IndexedDB
 * e sincronizzandole quando torna la connessione.
 */

export interface OfflinePunch {
  id: string
  punchType: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'
  venueId: string
  venueName: string
  timestamp: string
  latitude?: number
  longitude?: number
  accuracy?: number
  synced: boolean
  syncAttempts: number
  lastSyncError?: string
  createdAt: string
}

const DB_NAME = 'weiss-offline'
const DB_VERSION = 1
const STORE_NAME = 'punch-queue'

let db: IDBDatabase | null = null

/**
 * Apre/crea il database IndexedDB
 */
async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Errore apertura IndexedDB'))
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Crea object store per le timbrature offline
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('synced', 'synced', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

/**
 * Genera un ID unico per la timbratura offline
 */
function generateId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Salva una timbratura offline
 */
export async function savePunchOffline(punch: Omit<OfflinePunch, 'id' | 'synced' | 'syncAttempts' | 'createdAt'>): Promise<OfflinePunch> {
  const database = await openDB()

  const offlinePunch: OfflinePunch = {
    ...punch,
    id: generateId(),
    synced: false,
    syncAttempts: 0,
    createdAt: new Date().toISOString(),
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.add(offlinePunch)

    request.onsuccess = () => resolve(offlinePunch)
    request.onerror = () => reject(new Error('Errore salvataggio punch offline'))
  })
}

/**
 * Recupera tutte le timbrature non sincronizzate
 */
export async function getUnsyncedPunches(): Promise<OfflinePunch[]> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      // Filtra manualmente le timbrature non sincronizzate
      const allPunches = request.result as OfflinePunch[]
      const unsynced = allPunches.filter(punch => !punch.synced)
      resolve(unsynced)
    }
    request.onerror = () => reject(new Error('Errore lettura punch offline'))
  })
}

/**
 * Recupera tutte le timbrature (per debug/visualizzazione)
 */
export async function getAllPunches(): Promise<OfflinePunch[]> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Errore lettura punch offline'))
  })
}

/**
 * Marca una timbratura come sincronizzata
 */
export async function markPunchSynced(id: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const punch = getRequest.result as OfflinePunch
      if (punch) {
        punch.synced = true
        const updateRequest = store.put(punch)
        updateRequest.onsuccess = () => resolve()
        updateRequest.onerror = () => reject(new Error('Errore aggiornamento punch'))
      } else {
        resolve()
      }
    }
    getRequest.onerror = () => reject(new Error('Errore lettura punch'))
  })
}

/**
 * Aggiorna il contatore tentativi sync e l'errore
 */
export async function updatePunchSyncAttempt(id: string, error?: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const punch = getRequest.result as OfflinePunch
      if (punch) {
        punch.syncAttempts++
        punch.lastSyncError = error
        const updateRequest = store.put(punch)
        updateRequest.onsuccess = () => resolve()
        updateRequest.onerror = () => reject(new Error('Errore aggiornamento punch'))
      } else {
        resolve()
      }
    }
    getRequest.onerror = () => reject(new Error('Errore lettura punch'))
  })
}

/**
 * Elimina le timbrature sincronizzate più vecchie di X giorni
 */
export async function cleanupSyncedPunches(daysOld: number = 7): Promise<number> {
  const database = await openDB()
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()
    let deletedCount = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      if (cursor) {
        const punch = cursor.value as OfflinePunch
        if (punch.synced && punch.createdAt < cutoffDate) {
          cursor.delete()
          deletedCount++
        }
        cursor.continue()
      } else {
        resolve(deletedCount)
      }
    }
    request.onerror = () => reject(new Error('Errore cleanup punch'))
  })
}

/**
 * Sincronizza una singola timbratura con il server
 */
export async function syncPunch(punch: OfflinePunch): Promise<boolean> {
  try {
    const response = await fetch('/api/attendance/punch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        punchType: punch.punchType,
        venueId: punch.venueId,
        latitude: punch.latitude,
        longitude: punch.longitude,
        accuracy: punch.accuracy,
        notes: `[Offline] Timbratura registrata offline il ${new Date(punch.timestamp).toLocaleString('it-IT')}`,
        // Usiamo il timestamp originale
        offlineTimestamp: punch.timestamp,
      }),
    })

    if (response.ok) {
      await markPunchSynced(punch.id)
      return true
    } else {
      const error = await response.json()
      await updatePunchSyncAttempt(punch.id, error.error || 'Errore sconosciuto')
      return false
    }
  } catch (error) {
    await updatePunchSyncAttempt(punch.id, (error as Error).message)
    return false
  }
}

/**
 * Sincronizza tutte le timbrature pendenti
 */
export async function syncAllPendingPunches(): Promise<{ synced: number; failed: number }> {
  const unsyncedPunches = await getUnsyncedPunches()
  let synced = 0
  let failed = 0

  // Ordina per timestamp per sincronizzare in ordine cronologico
  unsyncedPunches.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  for (const punch of unsyncedPunches) {
    // Salta se troppi tentativi falliti (max 5)
    if (punch.syncAttempts >= 5) {
      failed++
      continue
    }

    const success = await syncPunch(punch)
    if (success) {
      synced++
    } else {
      failed++
    }
  }

  return { synced, failed }
}

/**
 * Conta le timbrature pendenti
 */
export async function getPendingPunchCount(): Promise<number> {
  const unsynced = await getUnsyncedPunches()
  return unsynced.length
}

/**
 * Hook per rilevare stato online/offline
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}
