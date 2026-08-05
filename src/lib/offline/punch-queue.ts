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
 * Elimina una timbratura dalla coda.
 *
 * Serve per le timbrature che il server ha rifiutato definitivamente: lasciarle
 * in coda significherebbe ritentarle a ogni ritorno online senza che nulla
 * possa cambiare l'esito.
 */
export async function deletePunch(id: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Errore eliminazione punch offline'))
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
 * Esito della sincronizzazione di una timbratura.
 *
 * La distinzione fra `rejected` e `retry` è la ragione per cui questa funzione
 * non restituisce più un booleano: un rifiuto del server (domenica bloccata,
 * luogo in sola visualizzazione, posizione mancante) non diventerà mai un
 * successo ritentandolo, mentre un errore di rete sì.
 */
export type SyncOutcome =
  | { status: 'synced' }
  | { status: 'rejected'; reason: string }
  | { status: 'retry'; reason: string }

/** Timbratura scartata dal server, con il motivo da mostrare a chi l'ha fatta. */
export interface RejectedPunch {
  punchType: OfflinePunch['punchType']
  timestamp: string
  reason: string
}

/**
 * Codici 4xx che non sono un giudizio sulla timbratura ma sul momento in cui è
 * stata inviata: sessione scaduta, richiesta troppo lenta, troppe richieste.
 * Queste si ritentano, altrimenti una sessione scaduta cancellerebbe una
 * timbratura buona.
 */
const RITENTABILI = new Set([401, 408, 429])

/**
 * Sincronizza una singola timbratura con il server
 */
export async function syncPunch(punch: OfflinePunch): Promise<SyncOutcome> {
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
      return { status: 'synced' }
    }

    const body = await response.json().catch(() => ({}))
    const reason = body.error || 'Timbratura rifiutata dal server'

    // Rifiuto definitivo: si toglie dalla coda, altrimenti resterebbe lì per
    // sempre e il dipendente vedrebbe un contatore che non scende mai.
    if (response.status < 500 && !RITENTABILI.has(response.status)) {
      await deletePunch(punch.id)
      return { status: 'rejected', reason }
    }

    await updatePunchSyncAttempt(punch.id, reason)
    return { status: 'retry', reason }
  } catch (error) {
    const reason = (error as Error).message
    await updatePunchSyncAttempt(punch.id, reason)
    return { status: 'retry', reason }
  }
}

/**
 * Sincronizza tutte le timbrature pendenti
 */
export async function syncAllPendingPunches(): Promise<{
  synced: number
  failed: number
  rejected: RejectedPunch[]
}> {
  const unsyncedPunches = await getUnsyncedPunches()
  let synced = 0
  let failed = 0
  const rejected: RejectedPunch[] = []

  // Ordina per timestamp per sincronizzare in ordine cronologico
  unsyncedPunches.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  for (const punch of unsyncedPunches) {
    // Salta se troppi tentativi falliti (max 5)
    if (punch.syncAttempts >= 5) {
      failed++
      continue
    }

    const esito = await syncPunch(punch)
    if (esito.status === 'synced') {
      synced++
    } else if (esito.status === 'rejected') {
      rejected.push({
        punchType: punch.punchType,
        timestamp: punch.timestamp,
        reason: esito.reason,
      })
    } else {
      failed++
    }
  }

  return { synced, failed, rejected }
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
