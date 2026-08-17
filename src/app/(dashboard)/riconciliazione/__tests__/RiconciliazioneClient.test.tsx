import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RiconciliazioneClient } from '../RiconciliazioneClient'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { PropostaDiRiconciliazione, RispostaLotto } from '@/types/riconciliazione-assistita'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

/**
 * `vi.hoisted` e non una semplice variabile di modulo: la fabbrica di
 * `vi.mock` viene invocata quando il componente importa `next/navigation`,
 * cioè prima che il corpo di questo file abbia inizializzato le sue variabili.
 */
const navigazione = vi.hoisted(() => ({
  parametri: new URLSearchParams(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigazione.replace, push: vi.fn() }),
  useSearchParams: () => navigazione.parametri,
}))

beforeAll(() => installaStubDom())

const CAUSALE_ALTA = 'Bonifico a favore di ROMA GIANFRANCO SRL - PAGAMENTO FATTURA FT 177'
const CAUSALE_BASSA = 'Addebito SDD utenze - riferimento non leggibile'

function proposta(
  id: string,
  punteggio: number,
  bankTransactionId: string,
  causale: string
): PropostaDiRiconciliazione {
  return {
    id,
    regola: 'R1',
    punteggio,
    fattori: { importo: 30, riferimento: 20, controparte: 18, data: 15, codiceBanca: 10, unicita: 5 },
    motivazioni: [{ testo: 'Importo identico al residuo', segno: '+' }],
    stato: 'in_attesa',
    bankTransaction: {
      id: bankTransactionId,
      transactionDate: '2026-08-14T00:00:00.000Z',
      description: causale,
      amount: '-459.80',
    },
    gambe: [
      {
        id: `g-${id}`,
        importo: '459.80',
        schedule: {
          id: `s-${id}`,
          descrizione: `Scadenza di ${id}`,
          dataScadenza: '2026-07-13T00:00:00.000Z',
          numeroDocumento: 'FT 177',
          controparteNome: 'Roma Gianfranco S.r.l.',
          importoTotale: '459.80',
          importoPagato: '0',
          invoice: null,
        },
      },
    ],
  }
}

const LOTTO: RispostaLotto = {
  lotto: {
    id: 'l1',
    dateFrom: '2026-01-01T00:00:00.000Z',
    dateTo: '2026-08-16T00:00:00.000Z',
    regoleUsate: ['R1', 'R2', 'R3'],
    sogliaMinima: 40,
    stato: 'aperto',
    aiReferto: null,
    aiRefertoAt: null,
    createdAt: '2026-08-16T10:00:00.000Z',
  },
  proposte: [proposta('p1', 92, 'b1', CAUSALE_ALTA), proposta('p2', 45, 'b2', CAUSALE_BASSA)],
  contatori: {
    totali: 2,
    inAttesa: 2,
    approvate: 0,
    scartate: 0,
    superate: 0,
    alta: 1,
    media: 0,
    bassa: 1,
  },
}

let chiamate: Array<{ url: string; init?: RequestInit }> = []

function stubFetch(risposte: Array<[string, unknown]> = [['/api/riconciliazione-assistita/lotti/', LOTTO]]) {
  chiamate = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const indirizzo = String(url)
    chiamate.push({ url: indirizzo, init })
    const trovata = risposte.find(([prefisso]) => indirizzo.startsWith(prefisso))
    return { ok: true, json: async () => (trovata ? trovata[1] : {}) }
  }) as unknown as typeof fetch
}

function monta(query = '') {
  navigazione.parametri = new URLSearchParams(query)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RiconciliazioneClient />
    </QueryClientProvider>
  )
}

describe('RiconciliazioneClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubFetch()
  })

  // Senza lotto la pagina non è vuota: dice cosa il motore sta per cercare.
  it('senza lotto mostra le regole e il pulsante che calcola', () => {
    monta()

    expect(screen.getByText(/R1 · Banca ↔ Fattura fornitore/)).toBeInTheDocument()
    expect(screen.getByText(/R2 · Banca ↔ Fattura cliente/)).toBeInTheDocument()
    expect(screen.getByText(/R3 · Banca ↔ Scadenza senza fattura/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calcola Proposte' })).toBeEnabled()
  })

  it('«Calcola Proposte» genera il lotto e apre la sua coda nell\'URL', async () => {
    stubFetch([['/api/riconciliazione-assistita/lotti', { batchId: 'l9', contaProposte: 3, perFascia: { alta: 1, media: 1, bassa: 1 } }]])
    monta()

    fireEvent.click(screen.getByRole('button', { name: 'Calcola Proposte' }))

    await waitFor(() => expect(navigazione.replace).toHaveBeenCalledWith('/riconciliazione?lotto=l9'))
    const post = chiamate.find((c) => c.init?.method === 'POST')!
    expect(post.url).toBe('/api/riconciliazione-assistita/lotti')
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ regole: ['R1', 'R2', 'R3'] })
  })

  it('con ?lotto= mostra la coda, i conteggi per fascia e le schede', async () => {
    monta('lotto=l1')

    await waitFor(() => expect(screen.getByText(CAUSALE_ALTA)).toBeInTheDocument())
    expect(chiamate[0].url).toBe('/api/riconciliazione-assistita/lotti/l1')
    // I conteggi contano proposte, e la somma delle fasce fa «in attesa».
    expect(screen.getByRole('tab', { name: 'Alta (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Bassa (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tutte (2)' })).toBeInTheDocument()
    // Il filtro parte da Alta quando c'è qualcosa in Alta: la Bassa non è in coda.
    expect(screen.queryByText(CAUSALE_BASSA)).not.toBeInTheDocument()
  })

  it('con ?movimento= resta la sola riga chiesta, col chip e il ritorno all\'estratto conto', async () => {
    monta('lotto=l1&movimento=b2')

    await waitFor(() => expect(screen.getByText(CAUSALE_BASSA)).toBeInTheDocument())
    expect(screen.queryByText(CAUSALE_ALTA)).not.toBeInTheDocument()
    expect(screen.getByText('Stai guardando un solo movimento')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna all\'estratto conto' })).toHaveAttribute(
      'href',
      '/prima-nota/movimenti?register=BANK&movimento=b2'
    )

    // «Mostra tutti» toglie il movimento dall'indirizzo e tiene il lotto.
    fireEvent.click(screen.getByRole('button', { name: 'Mostra tutti' }))
    expect(navigazione.replace).toHaveBeenCalledWith('/riconciliazione?lotto=l1')
  })
})
