import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { EstrattoConto } from '../EstrattoConto'
import { FILTRI_DEFAULT } from '@/lib/banca/filtri-estratto-conto'
import {
  installaStubDom,
  montare,
  smontare,
  cliccare,
  perTesto,
  testoDellaPagina,
} from '@/components/scadenzario/__tests__/render-helpers'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

afterEach(async () => {
  await smontare()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

/** Attende una condizione con timer veri: qui le query si accendono a catena. */
async function attendiChe(condizione: () => boolean, cosa: string) {
  for (let i = 0; i < 50; i++) {
    if (condizione()) return
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
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

/** Il trigger di un menu a tendina Radix apre su `pointerdown`, non su `click`. */
async function aprireMenu(el: Element | null | undefined) {
  if (!el) throw new Error('Menu non trovato')
  await act(async () => {
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse',
      })
    )
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

function riga(id: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    venueId: 'v1',
    transactionDate: '2026-08-14',
    valueDate: null,
    description: `Bonifico a vs favore *DITTA ${id}`,
    descrizione: `DITTA ${id}`,
    causale: 'Bonifico a vs favore',
    note: null,
    amount: 907.9,
    balanceAfter: null,
    bankReference: null,
    importBatchId: null,
    importedAt: '2026-08-16T09:58:00.000Z',
    importSource: 'PSD2_GOCARDLESS',
    status: 'PENDING',
    sezione: 'ATTIVI',
    bankTransactionCode: '48//00',
    matchedEntryId: null,
    matchConfidence: null,
    reconciledBy: null,
    reconciledAt: null,
    createdAt: '2026-08-16T09:58:00.000Z',
    deletedAt: null,
    matchedEntry: null,
    bankAccount: { id: 'c1', name: 'Weiss' },
    modificato: false,
    stato: 'non_abbinato',
    residuo: 907.9,
    ...extra,
  }
}

const RISPOSTA = {
  data: [riga('1'), riga('2', { amount: -68.93, stato: 'non_abbinato', residuo: 68.93, modificato: true })],
  pagination: { page: 1, limit: 100, total: 231, totalPages: 3 },
  totali: { entrate: 138680.9, uscite: 126293.72, saldoNetto: 12387.18 },
  conteggi: { attivi: 231, delegheF24: 0, cbillPagopa: 0, cestino: 0 },
  summary: { total: 231, pending: 231, matched: 0, toReview: 0, manual: 0, ignored: 0, unmatched: 0 },
}

function stubTutto() {
  stubFetch([
    ['/api/bank-transactions', RISPOSTA],
    // La rotta vera risponde `{ accounts: [...] }`, non `{ data: [...] }`.
    ['/api/bank-accounts', { accounts: [{ id: 'c1', name: 'Weiss' }] }],
    ['/api/banca/sincronizzazione', { conti: [] }],
  ])
}

const richiesteLista = () => chiamate.filter((u) => u.startsWith('/api/bank-transactions?'))

describe('EstrattoConto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra schede coi conteggi, totali, righe e legenda', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    const testo = testoDellaPagina()
    expect(testo).toContain('Attivi (231)')
    expect(testo).toContain('Cestino (0)')
    expect(testo).toContain('138.680,90')
    expect(testo).toContain('12.387,18')
    expect(testo).toContain('Modificato')
    expect(testo).toContain('Legenda')
    expect(testo).toContain('Pagina 1 di 3')
    expect(testo).toContain('2 di 231')
  })

  it('cliccando «Importo» chiede l\'ordinamento al server, due stati', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await cliccare(perTesto('Importo', 'th button'))
    await attendiChe(
      () => richiesteLista().some((u) => u.includes('ordina=importo') && u.includes('verso=asc')),
      'la richiesta crescente'
    )
    expect(document.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Importo')

    await cliccare(perTesto('Importo', 'th button'))
    // `verso=desc` è il default dello schema e `filtriInSearchParams` non
    // scrive i default: la richiesta decrescente è quella con `ordina=importo`
    // e senza `verso`. Ciò che deve cambiare, e si vede, è l'`aria-sort`.
    await attendiChe(
      () => richiesteLista().some((u) => u.includes('ordina=importo') && !u.includes('verso=')),
      'la richiesta decrescente'
    )
    await attendiChe(
      () => document.querySelector('th[aria-sort="descending"]')?.textContent?.includes('Importo') === true,
      'la freccia in giù'
    )

    // Il terzo clic torna crescente: due stati, mai un terzo che rovescia la lista.
    await cliccare(perTesto('Importo', 'th button'))
    await attendiChe(
      () => richiesteLista().filter((u) => u.includes('verso=asc')).length >= 2,
      'di nuovo crescente'
    )
  })

  it('il menu Colonne nasconde una colonna e resta aperto', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await aprireMenu(perTesto('Colonne', 'button'))
    await attendiChe(() => !!perTesto('Causale', '[role="menuitemcheckbox"]'), 'il menu')

    await cliccare(perTesto('Causale', '[role="menuitemcheckbox"]'))
    await attendiChe(() => !perTesto('Causale', 'th'), 'la colonna nascosta')
    expect(perTesto('Descrizione', '[role="menuitemcheckbox"]')).toBeTruthy() // ancora aperto
    expect(window.localStorage.getItem('weiss.estrattoConto.colonne')).toContain('"data"')
    expect(window.localStorage.getItem('weiss.estrattoConto.colonne')).not.toContain('"causale"')
  })

  it('«Successiva» chiede la pagina 2; il cambio di scheda torna alla 1 e apre il Cestino', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('Pagina 1 di 3'), 'la paginazione')

    await cliccare(perTesto('Successiva'))
    await attendiChe(() => richiesteLista().some((u) => u.includes('page=2')), 'la seconda pagina')

    await premereScheda(perTesto('Cestino', '[role="tab"]'))
    // La pagina 1 è il default e non si scrive nell'URL: «senza `page`» è il
    // modo in cui si vede che si è tornati in cima, non solo che non si è
    // rimasti alla 2.
    await attendiChe(
      () => richiesteLista().some((u) => u.includes('cestino=1') && !u.includes('page=')),
      'il cestino dalla prima pagina'
    )
  })

  it('selezionando una riga compare la barra con «tutte le 231 del filtro»', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await cliccare(document.querySelector('tbody [role="checkbox"]'))
    await attendiChe(() => testoDellaPagina().includes('1 selezionato'), 'la barra')
    expect(perTesto(/tutte le 231/)).toBeTruthy()
  })
})
