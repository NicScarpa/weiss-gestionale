'use client'

import { useEffect } from 'react'
import { Wifi, WifiOff, CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useOffline } from '@/hooks/useOffline'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface OfflineIndicatorProps {
  showAlways?: boolean
  className?: string
}

export function OfflineIndicator({ showAlways = false, className }: OfflineIndicatorProps) {
  const { isOnline, isSyncing, pendingCount, hasPending, syncNow, prefetchData } = useOffline()

  // Show toast when going offline/online
  useEffect(() => {
    if (!isOnline) {
      toast.warning('Sei offline', {
        description: 'Le modifiche verranno salvate localmente e sincronizzate quando tornerai online.',
        duration: 5000,
        icon: <WifiOff className="h-4 w-4" />,
      })
    }
  }, [isOnline])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && hasPending) {
      syncNow().then(() => {
        toast.success('Sincronizzazione completata', {
          description: 'I dati offline sono stati sincronizzati con successo.',
          icon: <Check className="h-4 w-4" />,
        })
      })
    }
  }, [isOnline, hasPending, syncNow])

  // Prefetch data on mount when online
  useEffect(() => {
    if (isOnline) {
      prefetchData()
    }
  }, [isOnline, prefetchData])

  // Don't show anything if online and nothing pending (unless showAlways)
  if (isOnline && !hasPending && !showAlways) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        className
      )}
    >
      {!isOnline ? (
        <>
          <Badge variant="destructive" className="gap-1">
            <WifiOff className="h-3 w-3" />
            Offline
          </Badge>
          {hasPending && (
            <Badge variant="secondary" className="gap-1">
              <CloudOff className="h-3 w-3" />
              {pendingCount} da sincronizzare
            </Badge>
          )}
        </>
      ) : hasPending ? (
        <>
          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-600">
            <AlertCircle className="h-3 w-3" />
            {pendingCount} in attesa
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={syncNow}
            disabled={isSyncing}
            className="h-7 px-2"
          >
            <RefreshCw className={cn('h-3 w-3 mr-1', isSyncing && 'animate-spin')} />
            {isSyncing ? 'Sync...' : 'Sincronizza'}
          </Button>
        </>
      ) : showAlways ? (
        <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
          <Wifi className="h-3 w-3" />
          Online
        </Badge>
      ) : null}
    </div>
  )
}
