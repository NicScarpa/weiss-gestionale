import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import NuovoDipendentePage from '../page'

/**
 * Il modulo «Nuovo Dipendente»: la tendina «Ruolo».
 *
 * Era impossibile creare un dipendente. La pagina leggeva `rolesData?.roles`,
 * mentre `GET /api/roles` risponde `{ data: [...] }`: la lista arrivava sempre
 * vuota, la tendina si apriva senza voci e il salvataggio si fermava su
 * «Campi obbligatori mancanti: Ruolo», senza modo di rimediare dalla
 * schermata. Stessa famiglia del difetto già chiuso in AttendanceTab.
 *
 * Le due rotte rispondono in due forme diverse — `/api/venues` dà `{ venues }`,
 * `/api/roles` dà `{ data }` — e il test tiene ferme entrambe: è la
 * discordanza fra le due ad aver prodotto l'errore.
 */

/** API DOM che Radix usa e jsdom non implementa. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

/** Il campo indirizzo carica Google Maps: fuori tema e non montabile in jsdom. */
vi.mock('@/components/ui/address-autocomplete', () => ({
  AddressAutocomplete: () => <input aria-label="Indirizzo" />,
}))

/** Le risposte vere delle due rotte, con le chiavi che usano davvero. */
const SEDI = [{ id: 'sede-1', name: 'Weiss Cafè', code: 'WEISS' }]
const RUOLI = [
  { id: 'ruolo-admin', name: 'admin', description: null },
  { id: 'ruolo-manager', name: 'manager', description: null },
  { id: 'ruolo-staff', name: 'staff', description: null },
]

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/venues')) {
      return { ok: true, json: async () => ({ venues: SEDI }) } as Response
    }
    if (url.startsWith('/api/roles')) {
      return { ok: true, json: async () => ({ data: RUOLI }) } as Response
    }
    throw new Error(`Richiesta non prevista nel test: ${url}`)
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function conQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

async function montaModulo() {
  await act(async () => {
    render(conQueryClient(<NuovoDipendentePage />))
  })
}

/** Le tendine non hanno id: si riconoscono dal testo che mostrano da chiuse. */
function tendina(testo: string): HTMLElement {
  const trigger = Array.from(
    document.querySelectorAll<HTMLElement>('[role="combobox"]')
  ).find((b) => b.textContent?.includes(testo))
  if (!trigger) throw new Error(`Tendina «${testo}» non trovata`)
  return trigger
}

async function apri(trigger: HTMLElement) {
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  })
}

function vociAperte(): string[] {
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (o) => o.textContent?.trim() ?? ''
  )
}

describe('Nuovo Dipendente - tendine Ruolo e Sede', () => {
  it('elenca i ruoli restituiti da /api/roles', async () => {
    await montaModulo()
    await apri(tendina('Staff (default)'))

    expect(vociAperte()).toEqual(['Manager', 'Staff'])
  })

  it('non propone il ruolo admin', async () => {
    await montaModulo()
    await apri(tendina('Staff (default)'))

    expect(vociAperte()).not.toContain('Admin')
  })

  it('elenca le sedi restituite da /api/venues', async () => {
    await montaModulo()
    await apri(tendina('Seleziona sede'))

    expect(vociAperte()).toEqual(['Weiss Cafè (WEISS)'])
  })
})
