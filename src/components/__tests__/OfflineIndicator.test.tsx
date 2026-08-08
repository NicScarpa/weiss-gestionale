import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'

import { OfflineIndicator } from '../OfflineIndicator'
import { AVVISO_OFFLINE, type EsitoSincronizzazione, type SyncEvent } from '@/lib/offline'

/**
 * Due difetti, entrambi sul messaggio e non sul dato:
 *
 * 1. la sincronizzazione automatica annunciava «completata» qualunque cosa
 *    fosse successo, perché l'esito veniva buttato via (`syncNow().then(...)`);
 * 2. gli avvisi si impilavano, e chi salvava offline ne vedeva due opposti.
 *    Ora passano tutti dallo stesso id sonner, che li sostituisce.
 */

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

const sincronizza = vi.fn<() => Promise<EsitoSincronizzazione | null>>()

/** Gli ascoltatori registrati dal componente, che i test possono far scattare. */
const ascoltatori = new Set<(evento: SyncEvent) => void>()

function accadeInSincronizzazione(evento: SyncEvent) {
  ascoltatori.forEach((ascoltatore) => ascoltatore(evento))
}

vi.mock('@/lib/offline', async (importOriginal) => {
  const reale = await importOriginal<typeof import('@/lib/offline')>()
  return {
    ...reale,
    addSyncListener: (ascoltatore: (evento: SyncEvent) => void) => {
      ascoltatori.add(ascoltatore)
      return () => ascoltatori.delete(ascoltatore)
    },
  }
})
let stato = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  hasPending: false,
}

vi.mock('@/hooks/useOffline', () => ({
  CHIAVE_STATO_CODA: ['offline-pending-status'],
  useOffline: () => ({
    ...stato,
    syncNow: sincronizza,
    prefetchData: vi.fn().mockResolvedValue(undefined),
  }),
}))

let root: Root | null = null
let container: HTMLElement | null = null

async function montare() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<OfflineIndicator />)
  })
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  stato = { isOnline: true, isSyncing: false, pendingCount: 0, hasPending: false }
  sincronizza.mockResolvedValue(null)
  ascoltatori.clear()
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('OfflineIndicator', () => {
  it('quando cade la rete avvisa una volta sola, sul canale condiviso', async () => {
    stato.isOnline = false
    await montare()

    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.warning).mock.calls[0][1]).toMatchObject({ id: AVVISO_OFFLINE })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('se la sincronizzazione fallisce lo dice, invece di annunciare il successo', async () => {
    stato = { isOnline: true, isSyncing: false, pendingCount: 1, hasPending: true }
    await montare()

    // L'esito arriva come evento: il giro può averlo avviato il ritorno della
    // rete o il service worker, non per forza questo componente.
    await act(async () => {
      accadeInSincronizzazione({
        type: 'sync-error',
        data: { total: 1, synced: 0, daRiprovare: 1, bloccate: 0, error: 'Il server ha risposto 500' },
      })
    })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
    const [titolo, opzioni] = vi.mocked(toast.error).mock.calls[0]
    expect(titolo).toMatch(/non riuscita/i)
    expect(opzioni).toMatchObject({ id: AVVISO_OFFLINE })
    expect(opzioni?.description).toContain('restano su questo dispositivo')
    expect(opzioni?.description).toContain('Il server ha risposto 500')
  })

  it('quando la coda parte davvero, annuncia quante ne sono partite', async () => {
    stato = { isOnline: true, isSyncing: false, pendingCount: 2, hasPending: true }
    await montare()

    await act(async () => {
      accadeInSincronizzazione({ type: 'sync-complete', data: { total: 2, synced: 2 } })
    })

    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledTimes(1)
    const [, opzioni] = vi.mocked(toast.success).mock.calls[0]
    expect(opzioni).toMatchObject({ id: AVVISO_OFFLINE })
    expect(opzioni?.description).toContain('2 chiusure')
  })
})
