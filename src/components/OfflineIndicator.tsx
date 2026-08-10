'use client'

import { useCallback, useEffect } from 'react'
import { Wifi, WifiOff, CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useOffline } from '@/hooks/useOffline'
import { addSyncListener, AVVISO_OFFLINE } from '@/lib/offline'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface OfflineIndicatorProps {
  showAlways?: boolean
  className?: string
}

function chiusure(quante: number) {
  return quante === 1 ? '1 chiusura' : `${quante} chiusure`
}

export function OfflineIndicator({ showAlways = false, className }: OfflineIndicatorProps) {
  const { isOnline, isSyncing, pendingCount, hasPending, syncNow, prefetchData } = useOffline()

  // Show toast when going offline/online
  useEffect(() => {
    if (isOnline) return

    toast.warning('Sei offline', {
      id: AVVISO_OFFLINE,
      description:
        'Le chiusure che salvi restano su questo dispositivo e partono da sole quando torna la rete.',
      duration: 5000,
      icon: <WifiOff className="h-4 w-4" />,
    })
  }, [isOnline])

  /**
   * Racconta com'è andata la sincronizzazione, chiunque l'abbia avviata: il
   * ritorno della rete, il bottone qui sotto o un messaggio del service worker.
   *
   * Ascolta gli eventi invece di leggere il valore restituito da `syncNow`
   * perché quei tre non passano tutti di lì — e perché il difetto da cui si
   * parte era proprio un esito buttato via: si annunciava «Sincronizzazione
   * completata» anche quando in coda restava tutto.
   */
  useEffect(() => {
    const smettiDiAscoltare = addSyncListener((evento) => {
      if (evento.type === 'sync-complete') {
        const inviate = evento.data?.synced ?? 0
        if (inviate === 0) return
        toast.success('Sincronizzazione completata', {
          id: AVVISO_OFFLINE,
          description: `${chiusure(inviate)} inviate al server.`,
          icon: <Check className="h-4 w-4" />,
        })
        return
      }

      if (evento.type !== 'sync-error') return

      const bloccate = evento.data?.bloccate ?? 0
      const rimaste = (evento.data?.daRiprovare ?? 0) + bloccate
      const parti = [
        `${chiusure(rimaste || 1)} non sono state inviate e restano su questo dispositivo.`,
      ]
      if (evento.data?.error) parti.push(evento.data.error)
      if (bloccate > 0) {
        parti.push('Il server le ha rifiutate: vanno controllate prima di riprovare.')
      }

      toast.error('Sincronizzazione non riuscita', {
        id: AVVISO_OFFLINE,
        description: parti.join(' '),
        duration: 10000,
        icon: <AlertCircle className="h-4 w-4" />,
      })
    })

    // Avvolto: `addSyncListener` restituisce l'esito di `Set.delete`, e una
    // funzione di pulizia che restituisce un valore non è una funzione di
    // pulizia valida per React.
    return () => {
      smettiDiAscoltare()
    }
  }, [])

  // Auto-sync when coming back online
  useEffect(() => {
    if (!isOnline || !hasPending) return
    void syncNow()
  }, [isOnline, hasPending, syncNow])

  /**
   * Il bottone «Sincronizza». Diverso dall'automatismo su un punto: qui c'è
   * qualcuno che ha appena premuto e aspetta una risposta, quindi va detto
   * anche «non ho potuto fare niente» — che non emette nessun evento.
   */
  const sincronizzaOra = useCallback(async () => {
    const esito = await syncNow()

    if (esito && (esito.inviate > 0 || esito.daRiprovare > 0 || esito.bloccate > 0)) return

    toast.warning('Niente da inviare adesso', {
      id: AVVISO_OFFLINE,
      description:
        pendingCount > 0
          ? `${chiusure(pendingCount)} restano in attesa: il server le ha già rifiutate e vanno controllate.`
          : 'La coda è vuota.',
    })
  }, [syncNow, pendingCount])

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
            onClick={sincronizzaOra}
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
