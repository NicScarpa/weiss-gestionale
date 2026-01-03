'use client'

import { useState, useEffect, useCallback } from 'react'
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
  savePendingClosure: (data: any) => Promise<string>
  getCachedClosures: <T>() => Promise<T[]>
  getCachedVenues: <T>() => Promise<T[]>
  getCachedStaff: <T>() => Promise<T[]>
  getCachedAccounts: <T>() => Promise<T[]>
  getCachedSuppliers: <T>() => Promise<T[]>
  getCachedClosureById: <T>(id: string) => Promise<T | undefined>
}

export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [hasPending, setHasPending] = useState(false)

  // Update pending count
  const updatePendingStatus = useCallback(async () => {
    const count = await getPendingCount()
    const pending = await hasPendingSync()
    setPendingCount(count)
    setHasPending(pending)
  }, [])

  // Initialize and set up listeners
  useEffect(() => {
    // Set initial online status
    setIsOnline(getOnlineStatus())

    // Update pending status on mount
    updatePendingStatus()

    // Listen for sync events
    const unsubscribe = addSyncListener((event) => {
      switch (event.type) {
        case 'online':
          setIsOnline(true)
          break
        case 'offline':
          setIsOnline(false)
          break
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

    // Also listen for native online/offline events as backup
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      unsubscribe()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
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
  const savePending = useCallback(async (data: any) => {
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
