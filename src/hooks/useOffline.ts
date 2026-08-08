'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getOnlineStatus,
  addSyncListener,
  syncPendingData,
  prefetchDataForOffline,
  getPendingCount,
  hasPendingSync,
  savePendingClosure,
  getCachedData,
  getCachedItem,
} from '@/lib/offline'

interface UseOfflineReturn {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  hasPending: boolean
  syncNow: () => Promise<void>
  prefetchData: () => Promise<void>
  savePendingClosure: (data: unknown) => Promise<string>
  getCachedClosures: <T>() => Promise<T[]>
  getCachedVenues: <T>() => Promise<T[]>
  getCachedStaff: <T>() => Promise<T[]>
  getCachedAccounts: <T>() => Promise<T[]>
  getCachedSuppliers: <T>() => Promise<T[]>
  getCachedClosureById: <T>(id: string) => Promise<T | undefined>
}

// Lo stato online vive fuori da React (navigator + eventi del browser): lo si
// legge tramite useSyncExternalStore, così il primo render ha già il valore
// giusto senza doverlo sincronizzare con un setState dentro l'effetto.
function subscribeOnlineStatus(onStoreChange: () => void) {
  // Gli eventi 'online'/'offline' arrivano già dal modulo offline; i listener
  // nativi restano come backup, come prima.
  const unsubscribe = addSyncListener((event) => {
    if (event.type === 'online' || event.type === 'offline') {
      onStoreChange()
    }
  })

  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)

  return () => {
    unsubscribe()
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

// Lato server non esiste navigator: si assume online, come faceva lo stato iniziale.
function getServerOnlineStatus() {
  return true
}

export function useOffline(): UseOfflineReturn {
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getOnlineStatus,
    getServerOnlineStatus
  )
  const [isSyncing, setIsSyncing] = useState(false)

  // Conteggio delle chiusure in attesa: sta su IndexedDB, quindi si legge
  // al montaggio e si ricarica dopo ogni sincronizzazione o salvataggio.
  const { data: pendingStatus, refetch: refetchPendingStatus } = useQuery({
    queryKey: ['offline-pending-status'],
    // Come prima: ogni montaggio rilegge il conteggio.
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const count = await getPendingCount()
      const pending = await hasPendingSync()
      return { count, pending }
    },
  })

  const pendingCount = pendingStatus?.count ?? 0
  const hasPending = pendingStatus?.pending ?? false

  const updatePendingStatus = useCallback(async () => {
    await refetchPendingStatus()
  }, [refetchPendingStatus])

  // Set up listeners
  useEffect(() => {
    // Listen for sync events
    const unsubscribe = addSyncListener((event) => {
      switch (event.type) {
        case 'sync-start':
          setIsSyncing(true)
          break
        case 'sync-complete':
        case 'sync-error':
          setIsSyncing(false)
          updatePendingStatus()
          break
      }
    })

    return () => {
      unsubscribe()
    }
  }, [updatePendingStatus])

  // Sync now function
  const syncNow = useCallback(async () => {
    if (!isOnline || isSyncing) return
    setIsSyncing(true)
    try {
      await syncPendingData()
    } finally {
      setIsSyncing(false)
      await updatePendingStatus()
    }
  }, [isOnline, isSyncing, updatePendingStatus])

  // Prefetch data for offline use
  const prefetchData = useCallback(async () => {
    if (!isOnline) return
    await prefetchDataForOffline()
  }, [isOnline])

  // Save pending closure (for offline submission)
  const savePending = useCallback(async (data: unknown) => {
    const id = await savePendingClosure(data)
    await updatePendingStatus()
    return id
  }, [updatePendingStatus])

  // Cache getters
  const getCachedClosures = useCallback(<T>() => getCachedData<T>('cachedClosures'), [])
  const getCachedVenues = useCallback(<T>() => getCachedData<T>('cachedVenues'), [])
  const getCachedStaff = useCallback(<T>() => getCachedData<T>('cachedStaff'), [])
  const getCachedAccounts = useCallback(<T>() => getCachedData<T>('cachedAccounts'), [])
  const getCachedSuppliers = useCallback(<T>() => getCachedData<T>('cachedSuppliers'), [])
  const getCachedClosureById = useCallback(<T>(id: string) => getCachedItem<T>('cachedClosures', id), [])

  return {
    isOnline,
    isSyncing,
    pendingCount,
    hasPending,
    syncNow,
    prefetchData,
    savePendingClosure: savePending,
    getCachedClosures,
    getCachedVenues,
    getCachedStaff,
    getCachedAccounts,
    getCachedSuppliers,
    getCachedClosureById,
  }
}
