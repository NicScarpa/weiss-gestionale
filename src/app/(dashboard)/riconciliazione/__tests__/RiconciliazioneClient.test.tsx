import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { RiconciliazioneClient } from '../RiconciliazioneClient'
import {
  installaStubDom,
  montare,
  smontare,
  attendere,
  cliccare,
  perTesto,
  testoDellaPagina,
} from '@/components/scadenzario/__tests__/render-helpers'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

// Nessuna di queste prove passa da `?movimento=`: l'URL vuoto basta, e il
// componente smette di lanciare «invariant expected app router to be mounted».
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

afterEach(async () => {
  await smontare()
  vi.unstubAllGlobals()
})

/** Attende una condizione con timer veri: qui le query si accendono a catena (sede → dati). */
async function attendiChe(condizione: () => boolean, cosa: string): Promise<void> {
  for (let tentativo = 0; tentativo < 50; tentativo++) {
    if (condizione()) return
    await act(async () => {
      await new Promise((risolvi) => setTimeout(risolvi, 5))
    })
  }
  throw new Error(`Atteso invano: ${cosa}`)
}

/** Le schede Radix si attivano su `mousedown` (bottone sinistro), non su `click`. */
async function premereScheda(el: Element | null | undefined) {
  if (!el) throw new Error('Scheda non trovata')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
  })
}

let chiamate: string[] = []

function stubFetch(risposte: Array<[string, unknown]>) {
  chiamate = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const indirizzo = String(url)
      chiamate.push(indirizzo)
      const trovata = risposte.find(([prefisso]) => indirizzo.startsWith(prefisso))
      return new Response(JSON.stringify(trovata ? trovata[1] : {}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
  )
}

const RIEPILOGO = {
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

function movimento(id: string) {
  return {
    id,
    venueId: 'v1',
    transactionDate: '2026-08-14',
    valueDate: null,
    description: `MOVIMENTO ${id}`,
    amount: -12.5,
    balanceAfter: null,
    bankReference: null,
    importBatchId: null,
    importedAt: '2026-08-16T09:58:00.000Z',
    importSource: 'PSD2_GOCARDLESS',
    status: 'PENDING',
    matchedEntryId: null,
    matchConfidence: null,
    reconciledBy: null,
    reconciledAt: null,
    createdAt: '2026-08-16T09:58:00.000Z',
    matchedEntry: null,
    venue: { id: 'v1', name: 'Weiss', code: 'W' },
  }
}

/** 231 movimenti in tre pagine da 100: la pagina 1 ne mostra 100. */
function paginaDiMovimenti(pagina: number) {
  return {
    data: [movimento(`p${pagina}-1`), movimento(`p${pagina}-2`)],
    pagination: { page: pagina, limit: 100, total: 231, totalPages: 3 },
  }
}

// Il 16 agosto la pagina chiedeva `limit=100` e basta: dei 231 movimenti
// sincronizzati, 131 non erano raggiungibili da nessuna parte — né qui, né
// nella prima nota, dove non entrano. Chi arriva qui con «vai alla
// riconciliazione» deve poterli vedere tutti.
describe('RiconciliazioneClient: la paginazione', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dice quante pagine ci sono e a quale si è', async () => {
    stubFetch([
      ['/api/venues', { venues: [{ id: 'v1', isActive: true }] }],
      ['/api/reconciliation/summary', RIEPILOGO],
      ['/api/bank-transactions', paginaDiMovimenti(1)],
      ['/api/banca/sincronizzazione', { conti: [] }],
    ])

    await montare(<RiconciliazioneClient />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('MOVIMENTO p1-1'), 'le righe della prima pagina')
    await attendiChe(() => testoDellaPagina().includes('Pagina 1 di 3'), 'il contatore delle pagine')

    expect(testoDellaPagina()).toContain('231 movimenti totali')
  })

  it('«Successiva» chiede la pagina dopo al server', async () => {
    stubFetch([
      ['/api/venues', { venues: [{ id: 'v1', isActive: true }] }],
      ['/api/reconciliation/summary', RIEPILOGO],
      ['/api/bank-transactions', paginaDiMovimenti(1)],
      ['/api/banca/sincronizzazione', { conti: [] }],
    ])

    await montare(<RiconciliazioneClient />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Pagina 1 di 3'), 'il contatore delle pagine')

    await cliccare(perTesto('Successiva'))
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/bank-transactions') && u.includes('page=2')),
      'la richiesta della seconda pagina'
    )

    expect(chiamate.some((u) => u.startsWith('/api/bank-transactions') && u.includes('page=2'))).toBe(true)
  })

  // Cambiare scheda (Da Verificare, Non Matchati…) cambia l'insieme: la
  // pagina 3 di «Tutti» non esiste in «Riconciliati», e restarci mostrerebbe
  // il vuoto di una pagina che non c'è.
  it('cambiando filtro si torna alla prima pagina', async () => {
    stubFetch([
      ['/api/venues', { venues: [{ id: 'v1', isActive: true }] }],
      ['/api/reconciliation/summary', RIEPILOGO],
      ['/api/bank-transactions', paginaDiMovimenti(1)],
      ['/api/banca/sincronizzazione', { conti: [] }],
    ])

    await montare(<RiconciliazioneClient />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Pagina 1 di 3'), 'il contatore delle pagine')

    await cliccare(perTesto('Successiva'))
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/bank-transactions') && u.includes('page=2')),
      'la richiesta della seconda pagina'
    )

    await premereScheda(perTesto('Riconciliati', '[role="tab"]'))
    await attendiChe(
      () =>
        chiamate.some(
          (u) => u.startsWith('/api/bank-transactions') && u.includes('status=MATCHED') && u.includes('page=1')
        ),
      'la prima pagina dei riconciliati'
    )
  })
})
