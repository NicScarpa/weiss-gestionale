'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { getCurrentPosition, VenueLocation } from '@/lib/geolocation'
import { savePunchOffline, syncAllPendingPunches, getPendingPunchCount } from '@/lib/offline'
import { LogIn, LogOut, Coffee, Loader2, WifiOff, CloudUpload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AttendanceStatus } from './PunchStatus'

import { logger } from '@/lib/logger'

type ServiceWorkerRegistrationWithSync = ServiceWorkerRegistration & {
  sync: { register(tag: string): Promise<void> }
}

type PunchType = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'

interface PunchButtonProps {
  status: AttendanceStatus
  venue: VenueLocation | null
  disabled?: boolean
  className?: string
}

const buttonConfig: Record<
  AttendanceStatus,
  {
    punchType: PunchType
    label: string
    icon: React.ElementType
    bgColor: string
    hoverColor: string
  }
> = {
  NOT_CLOCKED_IN: {
    punchType: 'IN',
    label: 'TIMBRA ENTRATA',
    icon: LogIn,
    bgColor: 'bg-gray-900',
    hoverColor: 'hover:bg-black',
  },
  CLOCKED_IN: {
    punchType: 'OUT',
    label: 'TIMBRA USCITA',
    icon: LogOut,
    bgColor: 'bg-red-500',
    hoverColor: 'hover:bg-red-600',
  },
  ON_BREAK: {
    punchType: 'BREAK_END',
    label: 'FINE PAUSA',
    icon: Coffee,
    bgColor: 'bg-amber-500',
    hoverColor: 'hover:bg-amber-600',
  },
  CLOCKED_OUT: {
    punchType: 'IN',
    label: 'NUOVO TURNO',
    icon: LogIn,
    bgColor: 'bg-gray-900',
    hoverColor: 'hover:bg-black',
  },
}

export function PunchButton({
  status,
  venue,
  disabled = false,
  className,
}: PunchButtonProps) {
  const queryClient = useQueryClient()
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  // Rileva stato online/offline
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)

    // Stato iniziale
    queueMicrotask(() => setIsOnline(navigator.onLine))

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  // Carica conteggio timbrature pendenti
  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const count = await getPendingPunchCount()
        setPendingCount(count)
      } catch (error) {
        logger.error('Errore caricamento pendenti', error)
      }
    }

    loadPendingCount()
  }, [])

  // Funzione per sincronizzare - usa useCallback per avere sempre i valori aggiornati
  const performSync = useCallback(async () => {
    // Controlla direttamente da IndexedDB per evitare stale closures
    const currentPending = await getPendingPunchCount()
    if (currentPending === 0) return

    setIsSyncing(true)
    try {
      const result = await syncAllPendingPunches()
      if (result.synced > 0) {
        toast.success(`${result.synced} timbrature sincronizzate`)
        queryClient.invalidateQueries({ queryKey: ['attendance-current'] })
        queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} timbrature non sincronizzate`)
      }
      const newCount = await getPendingPunchCount()
      setPendingCount(newCount)
    } catch (error) {
      logger.error('Errore sync', error)
    } finally {
      setIsSyncing(false)
    }
  }, [queryClient])

  // Sincronizza quando torna online
  useEffect(() => {
    if (isOnline && !isSyncing) {
      performSync()
    }
  }, [isOnline, isSyncing, performSync])

  // Ascolta messaggi dal service worker per Background Sync
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_PUNCHES') {
        performSync()
      }
    }

    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage)
    }
  }, [performSync])

  const config = buttonConfig[status]
  const Icon = config.icon

  const punchMutation = useMutation({
    mutationFn: async (data: {
      punchType: PunchType
      venueId: string
      latitude?: number
      longitude?: number
      accuracy?: number
    }) => {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nella timbratura')
      }

      return res.json()
    },
    onSuccess: (data) => {
      // Invalida le query per aggiornare lo stato
      queryClient.invalidateQueries({ queryKey: ['attendance-current'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })

      const typeLabels: Record<PunchType, string> = {
        IN: 'Entrata',
        OUT: 'Uscita',
        BREAK_START: 'Inizio pausa',
        BREAK_END: 'Fine pausa',
      }

      const message = data.data.isWithinRadius
        ? `${typeLabels[config.punchType]} registrata`
        : `${typeLabels[config.punchType]} registrata (fuori sede)`

      toast.success(message)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handlePunch = async () => {
    if (!venue) {
      toast.error('Nessuna sede selezionata')
      return
    }

    setIsGettingLocation(true)

    try {
      // Ottieni posizione GPS
      let position: { latitude?: number; longitude?: number; accuracy?: number } = {}
      try {
        position = await getCurrentPosition()
      } catch (gpsError) {
        logger.warn('GPS error', { error: gpsError })
        // Continua senza GPS
      }

      // Se offline, salva localmente
      if (!isOnline) {
        await savePunchOffline({
          punchType: config.punchType,
          venueId: venue.id,
          venueName: venue.name,
          timestamp: new Date().toISOString(),
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
        })

        const typeLabels: Record<PunchType, string> = {
          IN: 'Entrata',
          OUT: 'Uscita',
          BREAK_START: 'Inizio pausa',
          BREAK_END: 'Fine pausa',
        }

        toast.success(`${typeLabels[config.punchType]} salvata offline`, {
          description: 'Verrà sincronizzata quando tornerai online',
          icon: <WifiOff className="h-4 w-4" />,
        })

        // Registra Background Sync per sincronizzare quando torna online
        if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
          try {
            const registration = await navigator.serviceWorker.ready
            await (registration as ServiceWorkerRegistrationWithSync).sync.register('sync-punches')
          } catch (err) {
            logger.warn('Background Sync non disponibile', { error: err })
          }
        }

        setPendingCount(prev => prev + 1)
        return
      }

      // Invia timbratura online
      await punchMutation.mutateAsync({
        punchType: config.punchType,
        venueId: venue.id,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      })
    } catch (err) {
      // Se fallisce la rete, salva offline
      if (!isOnline || (err instanceof Error && err.message.includes('fetch'))) {
        try {
          let position: { latitude?: number; longitude?: number; accuracy?: number } = {}
          try {
            position = await getCurrentPosition()
          } catch {
            // Continua senza GPS
          }

          await savePunchOffline({
            punchType: config.punchType,
            venueId: venue.id,
            venueName: venue.name,
            timestamp: new Date().toISOString(),
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
          })

          toast.success('Timbratura salvata offline', {
            description: 'Verrà sincronizzata quando tornerai online',
          })

          // Registra Background Sync
          if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
            try {
              const registration = await navigator.serviceWorker.ready
              await (registration as ServiceWorkerRegistrationWithSync).sync.register('sync-punches')
            } catch (err) {
              logger.warn('Background Sync non disponibile', { error: err })
            }
          }

          setPendingCount(prev => prev + 1)
        } catch {
          toast.error('Errore nel salvataggio offline')
        }
      } else {
        toast.error(
          (err as { message?: string })?.message ||
            'Errore nella timbratura'
        )
      }
    } finally {
      setIsGettingLocation(false)
    }
  }

  const isLoading = isGettingLocation || punchMutation.isPending

  return (
    <div className="space-y-2">
      {/* Indicatore offline */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-lg py-2 px-3">
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">Modalità offline</span>
        </div>
      )}

      {/* Badge timbrature pendenti */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-center gap-2 text-blue-600 bg-blue-50 rounded-lg py-2 px-3">
          {isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Sincronizzazione in corso...</span>
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4" />
              <span className="text-sm font-medium">
                {pendingCount} timbratur{pendingCount === 1 ? 'a' : 'e'} da sincronizzare
              </span>
            </>
          )}
        </div>
      )}

      <Button
        onClick={handlePunch}
        disabled={disabled || isLoading || !venue}
        className={cn(
          'w-full h-24 text-xl font-bold text-white shadow-md rounded-2xl',
          !isOnline ? 'bg-amber-600 hover:bg-amber-700' : config.bgColor,
          !isOnline ? '' : config.hoverColor,
          'transition-all duration-200',
          'active:scale-[0.98]',
          className
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-3 h-8 w-8 animate-spin" />
            {isGettingLocation ? 'Rilevamento GPS...' : 'Timbratura...'}
          </>
        ) : (
          <>
            {!isOnline && <WifiOff className="mr-2 h-6 w-6" />}
            <Icon className="mr-3 h-8 w-8" />
            {config.label}
            {!isOnline && ' (Offline)'}
          </>
        )}
      </Button>
    </div>
  )
}

// Pulsante separato per la pausa (quando si è in servizio)
export function BreakButton({
  venue,
  disabled = false,
  className,
}: {
  venue: VenueLocation | null
  disabled?: boolean
  className?: string
}) {
  const queryClient = useQueryClient()
  const [isGettingLocation, setIsGettingLocation] = useState(false)

  const punchMutation = useMutation({
    mutationFn: async (data: {
      punchType: PunchType
      venueId: string
      latitude?: number
      longitude?: number
      accuracy?: number
    }) => {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nella timbratura')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-current'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      toast.success('Pausa iniziata')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleBreak = async () => {
    if (!venue) return

    setIsGettingLocation(true)

    try {
      const position = await getCurrentPosition()

      await punchMutation.mutateAsync({
        punchType: 'BREAK_START',
        venueId: venue.id,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      })
    } catch {
      try {
        await punchMutation.mutateAsync({
          punchType: 'BREAK_START',
          venueId: venue.id,
        })
      } catch {
        // Errore gestito da onError
      }
    } finally {
      setIsGettingLocation(false)
    }
  }

  const isLoading = isGettingLocation || punchMutation.isPending

  return (
    <Button
      variant="outline"
      onClick={handleBreak}
      disabled={disabled || isLoading || !venue}
      className={cn('flex-1', className)}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Coffee className="mr-2 h-4 w-4" />
      )}
      Inizia Pausa
    </Button>
  )
}
