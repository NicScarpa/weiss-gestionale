import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FreschezzaMovimenti, oreDa, ORE_PRIMA_DELL_AVVISO } from '../FreschezzaMovimenti'

function montaCon(risposta: unknown, ok = true) {
  global.fetch = vi.fn(async () => ({ ok, json: async () => risposta })) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FreschezzaMovimenti />
    </QueryClientProvider>
  )
}

function oreFa(ore: number): string {
  return new Date(Date.now() - ore * 3_600_000).toISOString()
}

describe('oreDa', () => {
  it('misura le ore trascorse', () => {
    const adesso = new Date('2026-08-15T12:00:00.000Z')
    expect(oreDa('2026-08-15T09:00:00.000Z', adesso)).toBe(3)
  })
})

describe('FreschezzaMovimenti', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dice a quando sono aggiornati i movimenti', async () => {
    montaCon({
      conti: [{ bankAccountId: 'c1', nomeConto: 'Banca della Marca', ultimaRiuscita: oreFa(2) }],
    })

    expect(await screen.findByText(/Banca della Marca: aggiornato al/)).toBeInTheDocument()
  })

  it('non segnala nulla se il ritardo è normale', async () => {
    montaCon({
      conti: [{ bankAccountId: 'c1', nomeConto: 'Banca della Marca', ultimaRiuscita: oreFa(2) }],
    })

    await screen.findByText(/aggiornato al/)
    expect(screen.queryByText(/più di due giorni fa/)).not.toBeInTheDocument()
  })

  it(`segnala il ritardo oltre le ${ORE_PRIMA_DELL_AVVISO} ore`, async () => {
    montaCon({
      conti: [
        {
          bankAccountId: 'c1',
          nomeConto: 'Banca della Marca',
          ultimaRiuscita: oreFa(ORE_PRIMA_DELL_AVVISO + 5),
        },
      ],
    })

    expect(await screen.findByText(/più di due giorni fa/)).toBeInTheDocument()
  })

  it('se non è mai stato sincronizzato lo dice, invece di tacere', async () => {
    montaCon({
      conti: [{ bankAccountId: 'c1', nomeConto: 'Banca della Marca', ultimaRiuscita: null }],
    })

    expect(await screen.findByText(/mai sincronizzato dalla banca/)).toBeInTheDocument()
  })

  // Senza collegamento bancario la pagina funziona lo stesso, coi soli
  // movimenti importati da CSV: non deve comparire un avviso fuori luogo.
  it('senza conti collegati non mostra nulla', async () => {
    const { container } = montaCon({ conti: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('se la lettura fallisce non rompe la pagina', async () => {
    const { container } = montaCon({}, false)
    expect(container).toBeEmptyDOMElement()
  })
})
