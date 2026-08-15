import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SegnaComePagataDialog, type ScadenzaDaSaldare } from '../SegnaComePagataDialog'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

/**
 * `fireEvent` e non `@testing-library/user-event`: i componenti Radix usati
 * qui — dialog, radio — non fanno pointer capture, quindi il click sintetico
 * basta e non serve aggiungere una dipendenza per simulare un puntatore.
 */

const UNA_RATA: ScadenzaDaSaldare[] = [
  { id: 'sc-1', stato: 'da_pagare', importoTotale: 120, importoPagato: 0 },
]

const DUE_RATE: ScadenzaDaSaldare[] = [
  { id: 'sc-1', stato: 'da_pagare', importoTotale: 60, importoPagato: 0, dataScadenza: '2026-09-30' },
  { id: 'sc-2', stato: 'da_pagare', importoTotale: 60, importoPagato: 0, dataScadenza: '2026-10-31' },
]

const CANDIDATI = {
  candidati: [
    {
      journalEntryId: 'mov-1',
      confidence: 0.92,
      description: 'BONIFICO A TIM SPA FATT 4230426800165996',
      date: '2026-08-10T00:00:00.000Z',
      amount: -120,
    },
  ],
}

let chiamate: Array<{ url: string; method: string; body: unknown }> = []

function mockFetch(rispostaPost: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>) {
  global.fetch = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    chiamate.push({
      url: url.pathname,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })

    if (method === 'GET' && url.pathname.endsWith('/riconciliazioni')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CANDIDATI) })
    }
    if (method === 'POST') {
      return rispostaPost()
    }
    return Promise.reject(new Error(`URL non gestita: ${method} ${url.pathname}`))
  }) as unknown as typeof fetch
}

function montare(schedules: ScadenzaDaSaldare[] = UNA_RATA) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SegnaComePagataDialog
        invoiceId="inv-1"
        schedules={schedules}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  chiamate = []
  mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }))
})

afterEach(cleanup)

describe('SegnaComePagataDialog: quale rata', () => {
  it('con una sola rata aperta non chiede quale rata', () => {
    montare()

    expect(screen.queryByText('Quale rata')).not.toBeInTheDocument()
  })

  it('con due rate aperte le mostra entrambe con la loro scadenza', () => {
    montare(DUE_RATE)

    expect(screen.getByText('Quale rata')).toBeInTheDocument()
    expect(screen.getByText(/30\/09\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/31\/10\/2026/)).toBeInTheDocument()
  })

  it('ignora le rate già saldate', () => {
    montare([
      ...UNA_RATA,
      { id: 'sc-2', stato: 'pagata', importoTotale: 60, importoPagato: 60 },
    ])

    expect(screen.queryByText('Quale rata')).not.toBeInTheDocument()
  })
})

describe('SegnaComePagataDialog: con un movimento già in prima nota', () => {
  it('elenca i candidati che il server propone, con la loro affinità', async () => {
    montare()

    expect(await screen.findByText(/BONIFICO A TIM SPA/)).toBeInTheDocument()
    expect(screen.getByText(/affinità 92%/)).toBeInTheDocument()
  })

  it('associa il movimento scelto alla rata', async () => {
    montare()

    fireEvent.click(await screen.findByLabelText(/BONIFICO A TIM SPA/))
    fireEvent.click(screen.getByRole('button', { name: 'Segna come pagata' }))

    await waitFor(() => {
      const post = chiamate.find((c) => c.method === 'POST')
      expect(post?.url).toBe('/api/scadenzario/sc-1/riconciliazioni')
      expect(post?.body).toEqual({ journalEntryId: 'mov-1', amount: 120 })
    })
  })

  it('non permette di confermare senza aver scelto un movimento', async () => {
    montare()
    await screen.findByText(/BONIFICO A TIM SPA/)

    expect(screen.getByRole('button', { name: 'Segna come pagata' })).toBeDisabled()
  })
})

describe('SegnaComePagataDialog: in contanti', () => {
  it('chiede la data e propone il residuo come importo', () => {
    montare()

    fireEvent.click(screen.getByLabelText(/In contanti/))

    expect(screen.getByLabelText(/Quando l'hai pagata/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('120.00')).toBeInTheDocument()
  })

  it('chiama paga-in-contanti con la data e l\'importo scelti', async () => {
    montare()

    fireEvent.click(screen.getByLabelText(/In contanti/))
    fireEvent.change(screen.getByLabelText(/Quando l'hai pagata/), {
      target: { value: '2026-08-12' },
    })
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Segna come pagata' }))

    await waitFor(() => {
      const post = chiamate.find((c) => c.method === 'POST')
      expect(post?.url).toBe('/api/scadenzario/sc-1/paga-in-contanti')
      expect(post?.body).toEqual({ dataPagamento: '2026-08-12', importo: 50 })
    })
  })
})

describe('SegnaComePagataDialog: quando il server rifiuta', () => {
  it('mostra il messaggio del server senza chiudere la finestra', async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'La quota supera il residuo della scadenza (50,00 €)' }),
      })
    )
    montare()

    fireEvent.click(screen.getByLabelText(/In contanti/))
    fireEvent.click(screen.getByRole('button', { name: 'Segna come pagata' }))

    // Il testo del server va letto prima di correggere: non è un toast che
    // scappa mentre la finestra si chiude.
    expect(
      await screen.findByText('La quota supera il residuo della scadenza (50,00 €)')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Segna come pagata' })).toBeInTheDocument()
  })
})
