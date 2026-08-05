'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getCurrentPosition, formatDistance, GeolocationError } from '@/lib/geolocation'
import { savePunchOffline, syncAllPendingPunches, getPendingPunchCount } from '@/lib/offline'
import type { AssignedLocation } from '@/lib/attendance/work-location'
import { LogIn, LogOut, Coffee, Loader2, WifiOff, CloudUpload, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AttendanceStatus } from './PunchStatus'

import { logger } from '@/lib/logger'

type ServiceWorkerRegistrationWithSync = ServiceWorkerRegistration & {
  sync: { register(tag: string): Promise<void> }
}

type PunchType = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'

/**
 * Sede su cui timbrare: le coordinate sono opzionali perché si può timbrare
 * anche su una sede senza geofencing configurato.
 */
export interface PunchVenue {
  id: string
  name: string
  latitude?: number | null
  longitude?: number | null
  geoFenceRadius?: number
}

const GPS_PERMISSION_HINT =
  'Hai negato l’accesso alla posizione. Riattivalo dalle impostazioni del browser (icona accanto all’indirizzo del sito) e ricarica la pagina.'

const TYPE_LABELS: Record<PunchType, string> = {
  IN: 'Entrata',
  OUT: 'Uscita',
  BREAK_START: 'Inizio pausa',
  BREAK_END: 'Fine pausa',
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as GeolocationError).code === 'PERMISSION_DENIED'
  )
}

/**
 * Rifiuto della route di timbratura.
 *
 * Il messaggio da solo non basta: "Sei fuori dal raggio di Villa Varda" non
 * dice di quanto, e chi legge non sa se deve fare due passi o cambiare paese.
 */
class PunchError extends Error {
  readonly code?: string
  readonly distance?: number
  readonly maxRadius?: number

  constructor(
    message: string,
    dettagli: { code?: string; distance?: number; maxRadius?: number } = {}
  ) {
    super(message)
    this.name = 'PunchError'
    this.code = dettagli.code
    this.distance = dettagli.distance
    this.maxRadius = dettagli.maxRadius
  }
}

async function readPunchError(res: Response): Promise<PunchError> {
  const body = await res.json().catch(() => ({}))

  return new PunchError(body.error || 'Errore nella timbratura', {
    code: body.code,
    distance: body.distance,
    maxRadius: body.maxRadius,
  })
}

/** Spiegazione da mettere sotto al messaggio del server, quando ce n'è una. */
function descrizioneErrore(err: unknown, gpsError: unknown): string | undefined {
  if (
    err instanceof PunchError &&
    err.distance !== undefined &&
    err.maxRadius !== undefined
  ) {
    return `Sei a ${formatDistance(err.distance)} dal punto di timbratura, il raggio consentito è ${err.maxRadius} m`
  }

  if (isPermissionDenied(gpsError)) return GPS_PERMISSION_HINT

  // Il permesso c'è ma la posizione non è arrivata: il server chiede il GPS e
  // il dispositivo non lo ha ancora agganciato.
  if (err instanceof PunchError && err.code === 'GEOLOCATION_REQUIRED') {
    return 'Il dispositivo non ha fornito la posizione: controlla che il GPS sia acceso e riprova, meglio se all’aperto.'
  }

  return undefined
}

interface PunchButtonProps {
  status: AttendanceStatus
  venue: PunchVenue | null
  /**
   * Luoghi di lavoro assegnati: dove nessuno consente di timbrare col GPS il
   * pulsante non deve nemmeno provarci, altrimenti l'unico modo per scoprirlo
   * è premerlo e leggere un rifiuto.
   */
  workLocations?: AssignedLocation[]
  /**
   * La sede chiede una nota all'uscita. Il controllo vero è del server, che
   * rifiuta con `EXIT_NOTE_REQUIRED`: qui serve solo a chiedere la nota prima
   * di partire, invece di far fallire il gesto e ricominciare.
   */
  requireExitNote?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Perché la timbratura non è possibile in nessuno dei luoghi assegnati, oppure
 * `null` se almeno uno la consente. Senza luoghi assegnati vale la sede, e il
 * pulsante resta attivo come prima dei luoghi di lavoro.
 */
function motivoBlocco(
  workLocations: AssignedLocation[]
): { testo: string; conLinkCorrezioni: boolean } | null {
  if (workLocations.length === 0) return null

  const modalita = new Set(workLocations.map((l) => l.trackingMode))
  if (modalita.has('GPS_GEOFENCE')) return null

  if (!modalita.has('MANUAL_HOURS')) {
    return { testo: 'Non sei abilitato a timbrare', conLinkCorrezioni: false }
  }

  // Chi dichiara le ore passa dalle richieste di correzione: il link è la
  // strada, non solo il divieto.
  return {
    testo:
      workLocations.length === 1
        ? 'Presso il tuo luogo di lavoro le ore si dichiarano, non si timbrano'
        : 'Nei tuoi luoghi di lavoro le ore si dichiarano, non si timbrano',
    conLinkCorrezioni: true,
  }
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
  workLocations = [],
  requireExitNote = false,
  disabled = false,
  className,
}: PunchButtonProps) {
  const queryClient = useQueryClient()
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [notaAperta, setNotaAperta] = useState(false)
  const [nota, setNota] = useState('')

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
      // Una timbratura rifiutata è stata tolta dalla coda: se non se ne dà il
      // motivo qui, sparisce senza che nessuno sappia perché.
      for (const scartata of result.rejected) {
        const ora = new Date(scartata.timestamp).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        })

        toast.error(
          `${TYPE_LABELS[scartata.punchType]} delle ${ora} non registrata`,
          { description: scartata.reason, duration: 10000 }
        )
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
      notes?: string
    }) => {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        throw await readPunchError(res)
      }

      return res.json()
    },
    onSuccess: (data) => {
      // Invalida le query per aggiornare lo stato
      queryClient.invalidateQueries({ queryKey: ['attendance-current'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      setNota('')

      // Con più luoghi di lavoro non basta dire "registrata": chi timbra deve
      // vedere dove il sistema lo ha collocato, per accorgersi subito di uno
      // sbaglio invece di scoprirlo a fine mese.
      const luogo = data.data.workLocation?.name
      const dove = luogo ? ` presso ${luogo}` : ''
      const message = data.data.isWithinRadius
        ? `${TYPE_LABELS[config.punchType]} registrata${dove}`
        : `${TYPE_LABELS[config.punchType]} registrata${dove} (fuori raggio)`

      toast.success(message)
    },
    // L'errore viene mostrato da handlePunch, che può arricchirlo con
    // il suggerimento sul permesso GPS negato.
  })

  /**
   * La nota si chiede solo online: la coda offline non porta testo libero — la
   * sincronizzazione manda una nota d'ufficio col momento della timbratura, ed
   * è per questo che il server esenta le richieste sincronizzate. Chiederla
   * quando si è offline significherebbe buttarla via.
   */
  const serveNota =
    isOnline && requireExitNote && config.punchType === 'OUT'

  const handlePunch = async (notaUscita?: string) => {
    if (!venue) {
      toast.error('Nessuna sede selezionata')
      return
    }

    if (serveNota && !notaUscita?.trim()) {
      setNotaAperta(true)
      return
    }

    setIsGettingLocation(true)
    let gpsError: unknown = null

    try {
      // Ottieni posizione GPS: se fallisce si prosegue comunque, è il server a
      // decidere se la sede richiede obbligatoriamente la posizione.
      let position: { latitude?: number; longitude?: number; accuracy?: number } = {}
      try {
        position = await getCurrentPosition()
      } catch (error) {
        gpsError = error
        logger.warn('GPS error', { error })
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

        toast.success(`${TYPE_LABELS[config.punchType]} salvata offline`, {
          description: 'Verrà sincronizzata quando tornerai online',
          icon: <WifiOff className="h-4 w-4" />,
        })

        // Senza posizione la sincronizzazione può essere rifiutata dal server
        // se la sede richiede la geolocalizzazione: meglio avvisare subito.
        if (isPermissionDenied(gpsError)) {
          toast.warning('Salvata senza posizione', {
            description: GPS_PERMISSION_HINT,
          })
        }

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
        notes: notaUscita?.trim() || undefined,
      })
    } catch (err) {
      // La policy chiede la nota e la richiesta è partita senza: la si domanda
      // invece di mostrare un errore, così il gesto si completa da dov'era.
      if (err instanceof PunchError && err.code === 'EXIT_NOTE_REQUIRED') {
        setNotaAperta(true)
        return
      }

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
        const message =
          (err as { message?: string })?.message || 'Errore nella timbratura'
        const description = descrizioneErrore(err, gpsError)
        toast.error(message, description ? { description } : undefined)
      }
    } finally {
      setIsGettingLocation(false)
    }
  }

  const isLoading = isGettingLocation || punchMutation.isPending
  const blocco = motivoBlocco(workLocations)

  return (
    <div className="space-y-2">
      {/* Indicatore offline */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-lg py-2 px-3">
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">Modalità offline</span>
        </div>
      )}

      {/* Perché il pulsante è spento */}
      {blocco && (
        <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground bg-muted rounded-lg py-2 px-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{blocco.testo}</span>
          </div>
          {blocco.conLinkCorrezioni && (
            <Link
              href="/portale/correzioni"
              className="text-sm font-medium text-gray-900 underline underline-offset-2"
            >
              Dichiara le ore da qui
            </Link>
          )}
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
        onClick={() => handlePunch()}
        disabled={disabled || isLoading || !venue || blocco !== null}
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

      <Dialog
        open={notaAperta}
        onOpenChange={(aperto) => !aperto && setNotaAperta(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Come è andata la giornata?</DialogTitle>
            <DialogDescription>
              Prima di timbrare l&apos;uscita scrivi due righe. È quello che
              spiega le ore che non tornano, senza dover ricostruire la giornata
              a fine mese.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota obbligatoria"
            maxLength={500}
            rows={4}
            autoFocus
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setNotaAperta(false)}>
              Annulla
            </Button>
            <Button
              disabled={nota.trim().length === 0 || isLoading}
              onClick={() => {
                setNotaAperta(false)
                handlePunch(nota)
              }}
            >
              Timbra uscita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Pulsante separato per la pausa (quando si è in servizio)
export function BreakButton({
  venue,
  disabled = false,
  className,
}: {
  venue: PunchVenue | null
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
        throw await readPunchError(res)
      }

      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-current'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })

      // Anche la pausa va attribuita a un luogo: se il sistema ha scelto quello
      // sbagliato è meglio accorgersene adesso, non a fine mese.
      const luogo = data.data.workLocation?.name
      toast.success(luogo ? `Pausa iniziata presso ${luogo}` : 'Pausa iniziata')
    },
    // L'errore viene mostrato da handleBreak insieme all'eventuale
    // suggerimento sul permesso GPS negato.
  })

  const handleBreak = async () => {
    if (!venue) return

    setIsGettingLocation(true)
    let gpsError: unknown = null

    try {
      let position: { latitude?: number; longitude?: number; accuracy?: number } = {}
      try {
        position = await getCurrentPosition()
      } catch (error) {
        gpsError = error
        logger.warn('GPS error', { error })
      }

      await punchMutation.mutateAsync({
        punchType: 'BREAK_START',
        venueId: venue.id,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      })
    } catch (err) {
      const message =
        (err as { message?: string })?.message || 'Errore nella timbratura'
      const description = descrizioneErrore(err, gpsError)
      toast.error(message, description ? { description } : undefined)
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
