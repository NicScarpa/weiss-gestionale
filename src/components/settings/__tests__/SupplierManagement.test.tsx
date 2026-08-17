import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SupplierManagement } from '../SupplierManagement'
import { CAMPI_ANAGRAFICA } from '@/lib/anagrafiche/campi'

/**
 * Il dialogo del fornitore, che ora monta lo stesso modulo del cliente.
 *
 * Prima aveva un elenco di campi tutto suo: niente telefono, niente note, e
 * nessun modo di scrivere il codice fiscale o il paese, che pure il database
 * teneva già. Questi test tengono ferma la parità con l'anagrafica cliente e
 * il fatto che il fornitore continui a partire con i nomi di colonna suoi.
 */

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

vi.mock('@/components/prima-nota/shared/AccountCombobox', () => ({
  AccountCombobox: () => <input aria-label="Conto predefinito" readOnly />,
}))

const FORNITORE = {
  id: 'fornitore-1',
  name: 'Caffè Trieste',
  vatNumber: '09876543210',
  fiscalCode: 'CFFTRS80A01H501Z',
  city: 'Trieste',
  phone: '+39 040 000000',
  notes: 'Consegna il martedì',
  country: 'IT',
  paymentTermsDays: 30,
  isActive: true,
}

let chiamate: Array<{ url: string; opzioni?: RequestInit }>

beforeEach(() => {
  chiamate = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, opzioni?: RequestInit) => {
    chiamate.push({ url: String(input), opzioni })
    return { ok: true, json: async () => ({ suppliers: [FORNITORE] }) } as Response
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Finché la lista non è arrivata il componente mostra solo lo spinner. */
async function attendi(condizione: () => boolean) {
  for (let tentativo = 0; tentativo < 50; tentativo++) {
    if (condizione()) return
    await act(async () => {
      await new Promise((risolvi) => setTimeout(risolvi, 5))
    })
  }
  throw new Error('La schermata non è mai uscita dal caricamento')
}

async function monta() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SupplierManagement />
      </QueryClientProvider>
    )
  })
  await attendi(() =>
    Array.from(document.querySelectorAll('button')).some(
      (b) => b.textContent?.trim() === 'Nuovo Fornitore'
    )
  )
}

function bottone(testo: string): HTMLButtonElement {
  const b = Array.from(document.querySelectorAll('button')).find(
    (x) => x.textContent?.trim() === testo
  )
  if (!b) throw new Error(`Bottone «${testo}» non trovato`)
  return b
}

async function apriNuovo() {
  await monta()
  await act(async () => {
    fireEvent.click(bottone('Nuovo Fornitore'))
  })
}

function campo(etichetta: string): HTMLInputElement {
  const label = Array.from(document.querySelectorAll('label')).find(
    (l) => l.textContent?.replace('*', '').trim() === etichetta
  )
  const id = label?.getAttribute('for')
  const controllo = id ? document.getElementById(id) : null
  if (!controllo) throw new Error(`Campo «${etichetta}» non trovato`)
  return controllo as HTMLInputElement
}

async function salva() {
  await act(async () => {
    fireEvent.click(bottone('Salva'))
  })
}

describe('dialogo fornitore', () => {
  it('mostra tutti i campi dell\'anagrafica, come per il cliente', async () => {
    await apriNuovo()

    const presenti = Array.from(document.querySelectorAll('label')).map(
      (l) => l.textContent?.replace('*', '').trim() ?? ''
    )
    const mancanti = CAMPI_ANAGRAFICA.filter((c) => !presenti.includes(c.etichetta))

    expect(mancanti.map((c) => c.etichetta)).toEqual([])
  })

  it('crea il fornitore con i nomi di colonna suoi', async () => {
    await apriNuovo()

    await act(async () => {
      fireEvent.change(campo('Denominazione'), { target: { value: 'Caffè Trieste' } })
      fireEvent.change(campo('Telefono'), { target: { value: '+39 040 000000' } })
      fireEvent.change(campo('Note'), { target: { value: 'Consegna il martedì' } })
    })
    await salva()

    const creazione = chiamate.find((c) => c.opzioni?.method === 'POST')
    expect(creazione?.url).toBe('/api/suppliers')
    expect(JSON.parse(String(creazione?.opzioni?.body))).toMatchObject({
      name: 'Caffè Trieste',
      phone: '+39 040 000000',
      notes: 'Consegna il martedì',
    })
  })

  it('in modifica riempie i campi e manda l\'identificativo', async () => {
    await monta()
    // La matita è un bottone di sola icona: si riconosce dall'icona, non dal testo.
    const matita = Array.from(document.querySelectorAll('button')).find(
      (b) => b.querySelector('svg.lucide-pencil') !== null
    )
    if (!matita) throw new Error('Bottone di modifica non trovato nella riga')
    await act(async () => {
      fireEvent.click(matita)
    })

    expect(campo('Denominazione').value).toBe('Caffè Trieste')
    expect(campo('Telefono').value).toBe('+39 040 000000')

    await salva()

    const modifica = chiamate.find((c) => c.opzioni?.method === 'PUT')
    expect(JSON.parse(String(modifica?.opzioni?.body))).toMatchObject({
      id: 'fornitore-1',
      name: 'Caffè Trieste',
    })
  })
})
