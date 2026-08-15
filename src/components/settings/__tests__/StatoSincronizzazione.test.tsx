import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatoSincronizzazione } from '../StatoSincronizzazione'

function montaCon(risposta: unknown) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => risposta,
  })) as unknown as typeof fetch

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <StatoSincronizzazione />
    </QueryClientProvider>
  )
}

const CONTO_BASE = {
  bankAccountId: 'c1',
  nomeConto: 'Banca della Marca',
  ultimaRiuscita: '2026-08-14T02:00:00.000Z',
  movimentiUltimaRiuscita: 7,
  ultimoEsito: 'OK' as const,
  sincronizzazioniRimaste: 3,
  riapreAlle: null,
}

describe('StatoSincronizzazione', () => {
  beforeEach(() => vi.clearAllMocks())

  it("dice quando è andata a buon fine l'ultima sincronizzazione", async () => {
    montaCon({ conti: [CONTO_BASE], mailConfigurata: true })

    expect(await screen.findByText(/Ultima sincronizzazione riuscita/)).toBeInTheDocument()
    expect(screen.getByText(/7 movimenti nuovi/)).toBeInTheDocument()
  })

  it('se non è mai stata fatta lo dice, invece di mostrare un vuoto', async () => {
    montaCon({
      conti: [{ ...CONTO_BASE, ultimaRiuscita: null, movimentiUltimaRiuscita: null }],
      mailConfigurata: true,
    })

    expect(await screen.findByText(/Mai sincronizzato/)).toBeInTheDocument()
  })

  // Un pulsante spento che non dice perché è un pulsante rotto.
  it('a contingente esaurito disabilita il pulsante e dice quando si riapre', async () => {
    montaCon({
      conti: [
        {
          ...CONTO_BASE,
          sincronizzazioniRimaste: 0,
          riapreAlle: '2026-08-16T00:00:00.000Z',
        },
      ],
      mailConfigurata: true,
    })

    const pulsante = await screen.findByRole('button', { name: /Sincronizza ora/ })
    expect(pulsante).toBeDisabled()
    expect(screen.getByText(/Il contingente si riapre/)).toBeInTheDocument()
  })

  it('con margine il pulsante è attivo e dice quante ne restano', async () => {
    montaCon({ conti: [CONTO_BASE], mailConfigurata: true })

    const pulsante = await screen.findByRole('button', { name: /Sincronizza ora/ })
    expect(pulsante).toBeEnabled()
    expect(screen.getByText(/3 sincronizzazioni disponibili oggi/)).toBeInTheDocument()
  })

  // Senza questo, chi guarda il pannello crede di essere coperto dagli avvisi.
  it('dichiara il canale email spento quando non è configurato', async () => {
    montaCon({ conti: [CONTO_BASE], mailConfigurata: false })

    expect(await screen.findByText(/Avvisi via email non configurati/)).toBeInTheDocument()
  })

  it('col canale configurato non mostra alcun avviso', async () => {
    montaCon({ conti: [CONTO_BASE], mailConfigurata: true })

    await waitFor(() => expect(screen.getByText('Movimenti')).toBeInTheDocument())
    expect(screen.queryByText(/Avvisi via email non configurati/)).not.toBeInTheDocument()
  })

  it("l'ultimo tentativo fallito si vede", async () => {
    montaCon({ conti: [{ ...CONTO_BASE, ultimoEsito: 'ERRORE' }], mailConfigurata: true })

    expect(await screen.findByText(/L’ultimo tentativo è fallito/)).toBeInTheDocument()
  })
})
