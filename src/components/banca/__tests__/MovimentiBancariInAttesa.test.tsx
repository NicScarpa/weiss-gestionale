import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MovimentiBancariInAttesa } from '../MovimentiBancariInAttesa'

function montaCon(risposta: unknown, ok = true) {
  global.fetch = vi.fn(async () => ({ ok, json: async () => risposta })) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MovimentiBancariInAttesa venueId="v1" />
    </QueryClientProvider>
  )
}

const RIEPILOGO_BASE = {
  totalTransactions: 231,
  matched: 0,
  toReview: 0,
  unmatched: 0,
  ignored: 0,
  pending: 231,
  bankBalance: 0,
  ledgerBalance: 0,
  difference: 0,
}

// Il 16 agosto la scheda Banca della prima nota era vuota mentre 231 movimenti
// dell'estratto conto stavano altrove: chi la guardava ha concluso che la banca
// non avesse portato nulla. Ora l'estratto conto è una sotto-scheda del Conto
// Bancario, e da «Tutti» questo cartello dice quanti sono e ci porta.
describe('MovimentiBancariInAttesa', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dice quanti movimenti aspettano e porta ai movimenti bancari', async () => {
    montaCon(RIEPILOGO_BASE)

    expect(await screen.findByText(/231 movimenti dell’estratto conto/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /movimenti bancari/i })).toHaveAttribute(
      'href',
      '/prima-nota/movimenti?register=BANK'
    )
  })

  // Contano tutti quelli non ancora chiusi, non solo i mai guardati: una
  // proposta da verificare e un movimento senza abbinamento aspettano quanto
  // un movimento appena arrivato.
  it('conta anche le proposte da verificare e i movimenti senza abbinamento', async () => {
    montaCon({ ...RIEPILOGO_BASE, pending: 200, toReview: 30, unmatched: 1, matched: 5 })

    expect(await screen.findByText(/231 movimenti dell’estratto conto/)).toBeInTheDocument()
  })

  it('con un movimento solo parla al singolare', async () => {
    montaCon({ ...RIEPILOGO_BASE, pending: 1 })

    expect(await screen.findByText(/1 movimento dell’estratto conto aspetta/)).toBeInTheDocument()
  })

  it('senza nulla in attesa non mostra niente', async () => {
    const { container } = montaCon({ ...RIEPILOGO_BASE, pending: 0, matched: 231 })

    // Lascia il tempo alla query di tornare: il vuoto deve essere una scelta,
    // non lo stato di caricamento.
    await new Promise((r) => setTimeout(r, 20))
    expect(container).toBeEmptyDOMElement()
  })

  it('se la lettura fallisce tace, senza rompere la pagina che lo ospita', async () => {
    const { container } = montaCon({ error: 'no' }, false)

    await new Promise((r) => setTimeout(r, 20))
    expect(container).toBeEmptyDOMElement()
  })
})
