'use client'

import {
  getSyncableClosures,
  requeueStalledClosures,
  updatePendingClosureStatus,
  deletePendingClosure,
  blockPendingClosure,
  cacheData,
  hasPendingSync,
  getPendingCount,
} from './db'

import { logger } from '@/lib/logger'
import { INTESTAZIONE_RISCALDAMENTO, PAGINA_CHIUSURA } from './cache-pagine'
// Event types for sync updates
type SyncEventType = 'sync-start' | 'sync-progress' | 'sync-complete' | 'sync-error' | 'online' | 'offline'

export interface SyncEvent {
  type: SyncEventType
  data?: {
    total?: number
    synced?: number
    error?: string
    /** Righe che restano in coda e si riproveranno. */
    daRiprovare?: number
    /** Righe che hanno esaurito i tentativi: le deve guardare una persona. */
    bloccate?: number
  }
}

// Sync event listeners
const syncListeners: Set<(event: SyncEvent) => void> = new Set()

export function addSyncListener(listener: (event: SyncEvent) => void) {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}

function notifySyncListeners(event: SyncEvent) {
  syncListeners.forEach((listener) => listener(event))
}

// Online/offline detection
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

export function getOnlineStatus() {
  return isOnline
}

// Initialize online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true
    notifySyncListeners({ type: 'online' })
    // Automatically trigger sync when coming back online
    syncPendingData()
  })

  window.addEventListener('offline', () => {
    isOnline = false
    notifySyncListeners({ type: 'offline' })
  })

  // Listen for service worker sync messages
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_CLOSURES') {
      syncPendingData()
    }
  })

  // Alla primissima visita il documento arriva dalla rete *prima* che il
  // service worker prenda il controllo: non passa da lui, non entra in nessuna
  // cache, e offline quella pagina non c'è — bisognava ricaricarla una seconda
  // volta con la rete ancora buona perché fosse disponibile senza. Appena il
  // controllo arriva la si richiede una volta: quella richiesta passa dal
  // service worker, che la mette in cache. Costa un documento in più, la prima
  // volta e a ogni aggiornamento del worker.
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    void scaldaLaPaginaCorrente()
    void scaldaLaChiusuraDiCassa()
  })
}

async function scaldaLaPaginaCorrente() {
  try {
    // L'intestazione non è decorativa: è ciò che fa instradare QUESTA
    // richiesta come una pagina.
    //
    // Il riscaldamento è una `fetch()` programmatica, quindi il suo
    // `request.mode` non è `'navigate'`. La regola del service worker che serve
    // le pagine senza rete seleziona le navigazioni — è ciò che il reload
    // offline è — e senza questo marcatore non vedrebbe mai il riscaldamento:
    // la pagina verrebbe scritta in un secchio e cercata in un altro.
    // Misurato: otto fallimenti su otto.
    //
    // Il nome dell'intestazione sta accanto al nome della cache, in
    // cache-pagine.ts, perché i due lati devono restare d'accordo.
    const risposta = await fetch(window.location.href, {
      credentials: 'same-origin',
      headers: { [INTESTAZIONE_RISCALDAMENTO]: '1' },
    })

    // Il corpo va letto fino in fondo, anche se non ce ne facciamo niente:
    // una risposta lasciata a metà tiene la connessione aperta per sempre.
    // Misurato — la pagina non raggiungeva più `networkidle`, e i test offline
    // andavano tutti in timeout su una richiesta che risultava «in corso» venti
    // secondi dopo essere arrivata.
    await risposta.arrayBuffer()
  } catch (error) {
    // Se fallisce si torna al comportamento di prima: la pagina entrerà in
    // cache al prossimo caricamento online. Non c'è niente da dire all'utente.
    logger.warn('[Offline] Pagina corrente non messa in cache', { motivo: String(error) })
  }
}

/**
 * Il modulo di chiusura entra in cache anche se non lo si è ancora aperto.
 *
 * È **il** modulo che si compila senza rete, ed è la ragione per cui questa
 * applicazione è una PWA: chi lo apre in un locale senza segnale deve trovarlo,
 * non doverlo aver visitato prima con la rete buona.
 *
 * Perché scaldarlo qui e non metterlo nel precache: il precache scarica
 * all'installazione del service worker, che avviene alla prima pagina aperta —
 * per un utente nuovo, `/login`, cioè proprio quando la sessione non c'è.
 * Provato: la voce precacheata conteneva il modulo di accesso invece della
 * chiusura, e sarebbe rimasta così fino al deploy successivo. Qui invece la
 * sessione c'è per costruzione, perché si scalda solo da una pagina
 * dell'applicazione; e se per qualunque motivo la risposta fosse comunque un
 * login, la guardia `cacheWillUpdate` del service worker la scarta.
 */
async function scaldaLaChiusuraDiCassa() {
  // Da `/login` non si scalda niente: senza sessione la risposta sarebbe il
  // login stesso. È la prima delle due difese, e quella che evita del tutto
  // una richiesta inutile.
  if (window.location.pathname.startsWith('/login')) return

  try {
    const risposta = await fetch(PAGINA_CHIUSURA, {
      credentials: 'same-origin',
      headers: { [INTESTAZIONE_RISCALDAMENTO]: '1' },
    })
    await risposta.arrayBuffer()
  } catch (error) {
    logger.warn('[Offline] Chiusura di cassa non messa in cache', { motivo: String(error) })
  }
}

/**
 * Codici che non sono un giudizio sul contenuto della chiusura ma sul momento
 * in cui è stata inviata: sessione scaduta, richiesta troppo lenta, troppe
 * richieste. Su questi si riprova, altrimenti una sessione scaduta bloccherebbe
 * per sempre una chiusura buona.
 */
const RITENTABILI = new Set([401, 408, 429])

/**
 * Che cosa fare di una chiusura, letto dalla risposta del server.
 * Funzione pura, così la politica dei tentativi si può leggere e provare senza
 * un browser intorno.
 */
export function classificaRisposta(status: number): 'consegnata' | 'riprova' | 'definitivo' {
  if (status >= 200 && status < 300) return 'consegnata'
  if (status >= 500 || RITENTABILI.has(status)) return 'riprova'
  return 'definitivo'
}

export interface EsitoSincronizzazione {
  /** Chiusure arrivate al server in questo giro. */
  inviate: number
  /** Righe che restano in coda e si riproveranno. */
  daRiprovare: number
  /** Righe che hanno esaurito i tentativi: nessuno le invierà più da solo. */
  bloccate: number
  /** Il primo motivo di fallimento, da mostrare a chi sta guardando. */
  motivo?: string
}

/**
 * Il giro di sincronizzazione in corso, se ce n'è uno.
 *
 * Al ritorno della rete partono due richiami: l'ascoltatore `online` di questo
 * modulo e l'effetto di `OfflineIndicator`. Senza questa guardia leggono la
 * coda insieme e la stessa chiusura viene spedita due volte; la seconda si
 * prende un 409 e finisce in errore, cioè un difetto inventato dal codice che
 * doveva salvarla.
 */
let sincronizzazioneInCorso: Promise<EsitoSincronizzazione> | null = null

// Sync pending closures to server
export function syncPendingData(): Promise<EsitoSincronizzazione> {
  if (sincronizzazioneInCorso) return sincronizzazioneInCorso

  sincronizzazioneInCorso = eseguiSincronizzazione().finally(() => {
    sincronizzazioneInCorso = null
  })

  return sincronizzazioneInCorso
}

async function eseguiSincronizzazione(): Promise<EsitoSincronizzazione> {
  if (!isOnline) {
    return { inviate: 0, daRiprovare: 0, bloccate: 0 }
  }

  await requeueStalledClosures()
  const daInviare = await getSyncableClosures()

  if (daInviare.length === 0) {
    return { inviate: 0, daRiprovare: 0, bloccate: 0 }
  }

  notifySyncListeners({
    type: 'sync-start',
    data: { total: daInviare.length },
  })

  let inviate = 0
  let daRiprovare = 0
  let bloccate = 0
  let motivo: string | undefined

  for (const item of daInviare) {
    try {
      await updatePendingClosureStatus(item.id, 'syncing')

      // Submit the closure to the server
      const response = await fetch('/api/chiusure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data),
      })

      if (response.ok) {
        await deletePendingClosure(item.id)
        inviate++
        notifySyncListeners({
          type: 'sync-progress',
          data: { total: daInviare.length, synced: inviate },
        })
        continue
      }

      const errorData = await response.json().catch(() => ({}))
      const dettaglio: string = errorData.error || `Il server ha risposto ${response.status}`
      motivo ??= dettaglio

      if (classificaRisposta(response.status) === 'definitivo') {
        await blockPendingClosure(item.id, dettaglio)
        bloccate++
      } else {
        await updatePendingClosureStatus(item.id, 'error', dettaglio)
        daRiprovare++
      }
    } catch (error) {
      // Qui la rete è caduta di nuovo a metà giro: la riga torna in attesa,
      // non è colpa sua.
      const dettaglio = error instanceof Error ? error.message : 'Errore di rete'
      motivo ??= dettaglio
      await updatePendingClosureStatus(item.id, 'error', dettaglio)
      daRiprovare++
    }
  }

  const tutteConsegnate = daRiprovare === 0 && bloccate === 0

  // L'esito viaggia sugli eventi e non solo nel valore restituito: chi lo
  // racconta all'utente non è chi ha avviato il giro. La sincronizzazione può
  // partire dall'ascoltatore `online` qui sopra o da un messaggio del service
  // worker, e in quei casi non c'è nessuna chiamata di cui leggere il ritorno.
  notifySyncListeners({
    type: tutteConsegnate ? 'sync-complete' : 'sync-error',
    data: {
      total: daInviare.length,
      synced: inviate,
      error: motivo,
      daRiprovare,
      bloccate,
    },
  })

  return { inviate, daRiprovare, bloccate, motivo }
}

// Pre-cache data for offline use
export async function prefetchDataForOffline() {
  if (!isOnline) return

  try {
    // Fetch and cache venues
    const venuesRes = await fetch('/api/venues')
    if (venuesRes.ok) {
      const { venues } = await venuesRes.json()
      await cacheData('cachedVenues', venues)
    }

    // Fetch and cache suppliers
    const suppliersRes = await fetch('/api/suppliers?full=true')
    if (suppliersRes.ok) {
      const { suppliers } = await suppliersRes.json()
      await cacheData('cachedSuppliers', suppliers)
    }

    // Fetch and cache accounts
    const accountsRes = await fetch('/api/accounts?full=true')
    if (accountsRes.ok) {
      const { accounts } = await accountsRes.json()
      await cacheData('cachedAccounts', accounts)
    }

    // Fetch and cache recent closures
    const closuresRes = await fetch('/api/chiusure?limit=50')
    if (closuresRes.ok) {
      const { chiusure } = await closuresRes.json()
      await cacheData('cachedClosures', chiusure)
    }

    logger.info('[Offline] Data prefetched successfully')
  } catch (error) {
    logger.error('[Offline] Error prefetching data', error)
  }
}

// Request background sync (if supported)
export async function requestBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-closures')
    } catch (error) {
      logger.error('[Offline] Background sync registration failed', error)
    }
  }
}

// Export utility functions
export { hasPendingSync, getPendingCount }
