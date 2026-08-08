import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useClosureMutation } from '../useClosureMutation'
import { ErroreSenzaRete } from '@/lib/offline'
import type { ClosureFormData } from '@/components/chiusura/ClosureForm'

/**
 * Il difetto che questi test tengono chiuso: la coda offline esisteva
 * (`savePendingClosure`, lo store `pendingClosures`, la sincronizzazione) ma
 * nessuno la chiamava. Chi salvava una chiusura senza rete vedeva un errore e
 * perdeva il conteggio della serata, mentre un secondo avviso gli prometteva
 * che sarebbe stata sincronizzata.
 *
 * Si monta con `createRoot` + `act` e non con `renderHook`: il progetto ha
 * `@testing-library/react` ma non il suo peer `@testing-library/dom`, e
 * importarlo fa fallire la suite prima di eseguirla.
 */

const salvaInCoda = vi.fn<(dati: unknown) => Promise<string>>()
const chiediSincronizzazioneInBackground = vi.fn()

vi.mock('@/lib/offline', async (importOriginal) => {
  const reale = await importOriginal<typeof import('@/lib/offline')>()
  return {
    ...reale,
    savePendingClosure: (dati: unknown) => salvaInCoda(dati),
    requestBackgroundSync: () => chiediSincronizzazioneInBackground(),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

let api: ReturnType<typeof useClosureMutation>
let root: Root | null = null
let container: HTMLElement | null = null

function Sonda({
  closureId,
  esponi,
}: {
  closureId?: string
  esponi: (api: ReturnType<typeof useClosureMutation>) => void
}) {
  const mutazione = useClosureMutation({ venueId: 'sede-1', closureId })
  // L'API si consegna al test da dentro un effetto, non durante il render:
  // scrivere su una variabile esterna mentre si renderizza è proprio ciò che
  // il compilatore di React non può assumere.
  useEffect(() => {
    esponi(mutazione)
  })
  return null
}

async function montare(closureId?: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <Sonda
          closureId={closureId}
          esponi={(mutazione) => {
            api = mutazione
          }}
        />
      </QueryClientProvider>
    )
  })
}

/** Una chiusura con dentro il conteggio di una serata: 50 € in cassa. */
function chiusuraCompilata(): ClosureFormData {
  return {
    date: new Date('2019-06-01T00:00:00.000Z'),
    venueId: 'sede-1',
    isEvent: false,
    stations: [
      {
        name: 'CASSA 1',
        position: 1,
        cashAmount: 50,
        posAmount: 50,
      } as ClosureFormData['stations'][0],
    ],
    partials: [],
    expenses: [],
    attendance: [],
  }
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  salvaInCoda.mockResolvedValue('coda-1')
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

describe('useClosureMutation senza rete', () => {
  it('mette la bozza in coda, con dentro i soldi contati', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await montare()

    let esito: Awaited<ReturnType<typeof api.saveDraft>> | undefined
    await act(async () => {
      esito = await api.saveDraft(chiusuraCompilata())
    })

    expect(esito).toEqual({ esito: 'in-coda', codaId: 'coda-1' })
    expect(salvaInCoda).toHaveBeenCalledTimes(1)

    // Non basta che qualcosa sia stato messo in coda: dentro ci deve essere il
    // conteggio, altrimenti al ritorno della rete si sincronizza il vuoto.
    const inCoda = salvaInCoda.mock.calls[0][0] as { stations: { cashAmount?: number }[] }
    expect(inCoda.stations[0].cashAmount).toBe(50)

    // La coda parte da sola anche a scheda chiusa.
    expect(chiediSincronizzazioneInBackground).toHaveBeenCalled()
  })

  it('se non riesce nemmeno a mettere in coda lo dice, invece di promettere', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    salvaInCoda.mockRejectedValue(new Error('IndexedDB non disponibile'))
    await montare()

    await expect(
      act(async () => {
        await api.saveDraft(chiusuraCompilata())
      })
    ).rejects.toBeInstanceOf(ErroreSenzaRete)
  })

  it('la modifica di una chiusura già sul server non finisce in coda', async () => {
    // La coda sa creare chiusure, non modificarne: accodare una modifica
    // creerebbe un doppione. È un limite, e va detto invece che nascosto.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await montare('chiusura-esistente')

    await expect(
      act(async () => {
        await api.updateClosure(chiusuraCompilata())
      })
    ).rejects.toBeInstanceOf(ErroreSenzaRete)
    expect(salvaInCoda).not.toHaveBeenCalled()
  })
})

describe('useClosureMutation con il server che risponde', () => {
  it('un rifiuto del server resta un errore: riproporlo darebbe lo stesso no', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Dati non validi', details: ['Data: obbligatoria'] }),
      })
    )
    await montare()

    await expect(
      act(async () => {
        await api.saveDraft(chiusuraCompilata())
      })
    ).rejects.toThrow(/dati non validi/i)
    expect(salvaInCoda).not.toHaveBeenCalled()
  })

  it('il salvataggio riuscito restituisce l’id della chiusura', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'chiusura-9' }) })
    )
    await montare()

    let esito: Awaited<ReturnType<typeof api.saveDraft>> | undefined
    await act(async () => {
      esito = await api.saveDraft(chiusuraCompilata())
    })

    expect(esito).toEqual({ esito: 'salvata', closureId: 'chiusura-9' })
    expect(salvaInCoda).not.toHaveBeenCalled()
  })
})
