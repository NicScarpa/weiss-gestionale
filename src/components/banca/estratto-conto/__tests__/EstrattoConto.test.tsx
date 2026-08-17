import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { toast } from 'sonner'
import { EstrattoConto } from '../EstrattoConto'
import { FILTRI_DEFAULT } from '@/lib/banca/filtri-estratto-conto'
import {
  installaStubDom,
  montare,
  smontare,
  cliccare,
  scrivere,
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

/**
 * Attende una condizione con timer veri: qui le query si accendono a catena.
 * `tentativi` si alza quando in mezzo c'è un'attesa dichiarata, come i 300 ms
 * del debounce della ricerca.
 */
async function attendiChe(condizione: () => boolean, cosa: string, tentativi = 50) {
  for (let i = 0; i < tentativi; i++) {
    if (condizione()) return
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
  }
  throw new Error(`Atteso invano: ${cosa}`)
}

const campoRicerca = () => document.querySelector<HTMLInputElement>('input[aria-label="Cerca fra i movimenti"]')

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
/** Le stesse richieste col verbo e il corpo: le azioni si giudicano da quelli. */
let richieste: Array<{ url: string; init?: RequestInit }> = []
function stubFetch(risposte: Array<[string, unknown]>) {
  chiamate = []
  richieste = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const indirizzo = String(url)
      chiamate.push(indirizzo)
      richieste.push({ url: indirizzo, init })
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
    origineScrittura: null,
    residuoDocumenti: null,
    proposta: false,
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

const VUOTA = {
  data: [],
  pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  totali: { entrate: 0, uscite: 0, saldoNetto: 0 },
  conteggi: { attivi: 12, delegheF24: 0, cbillPagopa: 0, cestino: 0 },
  summary: { total: 0, pending: 0, matched: 0, toReview: 0, manual: 0, ignored: 0, unmatched: 0 },
}

function stubTutto(lista: unknown = RISPOSTA) {
  stubFetch([
    // Prima della lista: la ricerca si ferma al primo prefisso che combacia, e
    // «/api/bank-transactions» combacerebbe anche con questa.
    ['/api/bank-transactions/categorizza-in-blocco', { toccate: 2, saltate: 0 }],
    ['/api/bank-transactions/azioni-in-blocco', { toccate: 2, saltate: 1 }],
    ['/api/bank-transactions', lista],
    // La rotta vera risponde `{ accounts: [...] }`, non `{ data: [...] }`.
    ['/api/bank-accounts', { accounts: [{ id: 'c1', name: 'Weiss' }] }],
    ['/api/banca/sincronizzazione', { conti: [] }],
    ['/api/accounts', { accounts: [] }],
    ['/api/cost-centers', { costCenters: [] }],
    ['/api/scadenzario', { data: [] }],
    ['/api/prima-nota', { data: [] }],
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
    expect(window.localStorage.getItem('weiss.estrattoConto.colonneNascoste')).toContain('"causale"')
    expect(window.localStorage.getItem('weiss.estrattoConto.colonneNascoste')).not.toContain('"data"')
  })

  // Le colonne nascoste stanno nel browser, che il server non ha: leggerle
  // durante il primo render faceva rendere sei colonne di là e quattro di qua,
  // ed è lo scarto che React segnala all'idratazione. Ora arrivano dopo il
  // montaggio — e devono comunque arrivare.
  it('le colonne nascoste nel browser spariscono dopo il montaggio', async () => {
    window.localStorage.setItem(
      'weiss.estrattoConto.colonne',
      JSON.stringify(['data', 'descrizione', 'conto', 'stato', 'importo'])
    )
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await attendiChe(() => !perTesto('Causale', 'th'), 'la colonna nascosta dal browser')
    expect(perTesto('Descrizione', 'th')).toBeTruthy()
  })

  // Cestinare tutta l'ultima pagina la fa sparire: restare lì vorrebbe dire
  // «Pagina 3 di 2» sopra un elenco vuoto, che si legge come un guasto.
  it('una pagina oltre il fondo scende all’ultima che esiste', async () => {
    stubTutto({ ...RISPOSTA, pagination: { page: 3, limit: 100, total: 150, totalPages: 2 } })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={{ ...FILTRI_DEFAULT, page: 3 }} />)

    await attendiChe(() => richiesteLista().some((u) => u.includes('page=2')), 'la richiesta della pagina 2')
    await attendiChe(() => testoDellaPagina().includes('Pagina 2 di 2'), 'la paginazione riallineata')
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

    // Sopra la tabella, non sotto: con cento righe a schermo una barra in fondo
    // resta fuori dalla finestra, e si spunta una casella senza vedere nulla
    // succedere. Il confronto parte dallo `span` del conteggio e non dal
    // riquadro della barra: un contenitore che *avvolge* la tabella risulta
    // ugualmente «prima» di lei, e il controllo passerebbe comunque.
    const contatore = perTesto('1 selezionato', 'span')!
    const tabella = document.querySelector('table')!
    expect(contatore.contains(tabella)).toBe(false)
    expect(contatore.compareDocumentPosition(tabella) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // La selezione «di tutto il filtro» è un'altra cosa dalla selezione delle
    // righe visibili, e la barra deve dirlo.
    await cliccare(perTesto(/tutte le 231/))
    await attendiChe(
      () => testoDellaPagina().includes('Tutte le 231 righe del filtro sono selezionate'),
      'la selezione estesa a tutto il filtro'
    )

    // Cambiata la scheda, quelle 231 righe non sono più le stesse: la barra
    // sparisce invece di restare a promettere un'azione sul vecchio insieme.
    await premereScheda(perTesto('Cestino', '[role="tab"]'))
    await attendiChe(
      () =>
        !testoDellaPagina().includes('righe del filtro sono selezionate') &&
        !testoDellaPagina().includes('selezionato'),
      'la barra sparita'
    )
  })

  // Il caso vero: si digita «banca » e si continua a scrivere. La casella
  // mandava al padre il testo ripulito e poi si riallineava a quello,
  // riscrivendosi da sé e mangiando la lettera appena battuta («bancadella»).
  it('uno spazio finale non fa riscrivere la casella di ricerca', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await scrivere(campoRicerca(), 'banca ')
    await attendiChe(
      () => richiesteLista().some((u) => u.includes('search=banca') && !u.includes('search=banca+')),
      'la ricerca ripulita al server',
      200
    )

    expect(campoRicerca()?.value).toBe('banca ')
  })

  it('una scheda vuota senza filtri dice come si riempie, non parla di filtri', async () => {
    stubTutto(VUOTA)
    await montare(
      <EstrattoConto venueId="v1" filtriIniziali={{ ...FILTRI_DEFAULT, sezione: 'DELEGHE_F24' }} />
    )
    await attendiChe(
      () => testoDellaPagina().includes('Nessun movimento in questa scheda'),
      'lo stato vuoto della scheda'
    )

    const testo = testoDellaPagina()
    expect(testo).toContain('menu azioni di una riga')
    expect(testo).not.toContain('corrisponde ai filtri')
    expect(testo).not.toContain('Collega la banca')
  })

  it('«Cancella filtri» pulisce i filtri e lascia la scheda dov\'è', async () => {
    stubTutto(VUOTA)
    await montare(
      <EstrattoConto
        venueId="v1"
        filtriIniziali={{ ...FILTRI_DEFAULT, sezione: 'DELEGHE_F24', tipo: 'uscite' }}
      />
    )
    await attendiChe(() => testoDellaPagina().includes('corrisponde ai filtri'), 'il vuoto filtrato')

    await cliccare(perTesto('Cancella filtri'))
    await attendiChe(
      () => richiesteLista().some((u) => u.includes('sezione=DELEGHE_F24') && !u.includes('tipo=')),
      'la scheda conservata senza il filtro tipo'
    )
  })

  it('il cestino sulla riga chiama la DELETE e ricarica', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    const primaDelClic = richiesteLista().length
    await cliccare(document.querySelector('tbody button[aria-label="Sposta nel Cestino"]'))
    await attendiChe(() => chiamate.some((u) => u === '/api/bank-transactions/1'), 'la DELETE')

    expect(richieste.find((r) => r.url === '/api/bank-transactions/1')?.init?.method).toBe('DELETE')
    // Cestinata la riga, i conteggi e i totali sono altri: la lista si rilegge.
    await attendiChe(() => richiesteLista().length > primaDelClic, 'la lista riletta')
  })

  it("l'azione in blocco su «tutte del filtro» manda il filtro, non gli id", async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    await cliccare(document.querySelector('tbody [role="checkbox"]'))
    await cliccare(perTesto(/tutte le 231/))
    // Il pulsante della barra e la scheda si chiamano tutti e due «Cestino»:
    // il selettore prende quello che non è una linguetta.
    await cliccare(perTesto('Cestino', 'button:not([role="tab"])'))
    await attendiChe(() => chiamate.some((u) => u.endsWith('/azioni-in-blocco')), 'la richiesta in blocco')

    const inBlocco = richieste.find((r) => r.url.endsWith('/azioni-in-blocco'))!
    const corpo = JSON.parse(String(inBlocco.init?.body))
    expect(corpo.azione).toBe('cestino')
    // Le 231 righe le ricalcola il server dal filtro: mandare gli id vorrebbe
    // dire toccare solo le due caricate in pagina.
    expect(corpo.filtro).toBeTruthy()
    expect(corpo.ids).toBeUndefined()
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      '2 movimenti nel Cestino · 1 saltato perché collegato a una scrittura'
    )
  })

  it('mostra la colonna Categoria dalla scrittura collegata', async () => {
    const collegata = riga('3', {
      amount: -0.75, matchedEntryId: 'e1', status: 'MANUAL', stato: 'abbinato_manualmente', residuo: 0, residuoDocumenti: 0,
      origineScrittura: 'CATEGORIZZA',
      matchedEntry: { id: 'e1', date: '2026-08-14', description: 'Commissioni', debitAmount: null, creditAmount: 0.75, documentRef: null, account: { id: 'a1', code: '05.01', name: 'Commissioni bancarie' }, costCenter: { id: 'cc1', code: 'STR', name: 'Struttura' }, fette: 0 },
    })
    stubTutto({ ...RISPOSTA, data: [riga('1'), collegata] })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')
    expect(perTesto('Categoria', 'th')).toBeTruthy()
    expect(testoDellaPagina()).toContain('05.01')
    expect(testoDellaPagina()).toContain('Commissioni bancarie')
  })

  it('le azioni di riga: Categorizza e Riconcilia nel menu di una riga libera', async () => {
    const collegata = riga('3', { matchedEntryId: 'e1', status: 'MANUAL', stato: 'abbinato_manualmente', residuo: 0, residuoDocumenti: 0, origineScrittura: 'COLLEGA',
      matchedEntry: { id: 'e1', date: '2026-08-14', description: 'x', debitAmount: 907.9, creditAmount: null, documentRef: null, account: null, costCenter: null, fette: 0 } })
    stubTutto({ ...RISPOSTA, data: [riga('1'), collegata] })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    // Il menu ⋯ della riga libera ha Categorizza e Riconcilia; Riconcilia porta alla pagina di riconciliazione filtrata.
    const menu = document.querySelectorAll('button[aria-label="Altre azioni"]')[0]
    await aprireMenu(menu)
    await attendiChe(() => !!perTesto('Categorizza', '[role="menuitem"]'), 'il menu')
    const riconcilia = perTesto('Riconcilia', '[role="menuitem"] a, a[role="menuitem"]') ?? perTesto('Riconcilia', 'a')
    expect(riconcilia?.getAttribute('href')).toBe('/riconciliazione?movimento=1')

    // Categorizza apre il dialogo sulla riga.
    await cliccare(perTesto('Categorizza', '[role="menuitem"]'))
    await attendiChe(() => testoDellaPagina().includes('Categorizza movimento'), 'il dialogo')
  })

  it('con «movimento» nell\'URL mostra il chip e «Mostra tutti» lo toglie', async () => {
    stubTutto({ ...RISPOSTA, data: [riga('1')], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={{ ...FILTRI_DEFAULT, movimento: '1' }} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'la riga')
    expect(testoDellaPagina()).toContain('Stai guardando un solo movimento')
    await cliccare(perTesto('Mostra tutti', 'button'))
    await attendiChe(() => richiesteLista().some((u) => !u.includes('movimento=')), 'la lista intera')
  })

  it('«Categorizza» dalla barra della selezione apre il dialogo per le righe scelte', async () => {
    stubTutto()
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')
    await cliccare(document.querySelector('tbody [role="checkbox"]'))
    await attendiChe(() => testoDellaPagina().includes('1 selezionato'), 'la barra')
    await cliccare(perTesto('Categorizza', 'button'))
    await attendiChe(() => testoDellaPagina().includes('Categorizza 1 movimento'), 'il dialogo')
  })

  it('Collega fattura sulla riga libera, Scollega su quella collegata, «Collega altra fattura» sulla parziale', async () => {
    const collegata = riga('3', { matchedEntryId: 'e1', status: 'MANUAL', stato: 'abbinato_manualmente', residuo: 0, residuoDocumenti: 0, origineScrittura: 'COLLEGA',
      matchedEntry: { id: 'e1', date: '2026-08-14', description: 'x', debitAmount: 907.9, creditAmount: null, documentRef: null, account: null, costCenter: null, fette: 0 } })
    const parziale = riga('4', { amount: -100, matchedEntryId: 'e2', status: 'MANUAL', stato: 'parziale', residuo: 40, residuoDocumenti: 40, origineScrittura: 'COLLEGA',
      matchedEntry: { id: 'e2', date: '2026-08-14', description: 'y', debitAmount: null, creditAmount: 100, documentRef: null, account: null, costCenter: null, fette: 0 } })
    stubTutto({ ...RISPOSTA, data: [riga('1'), collegata, parziale] })
    await montare(<EstrattoConto venueId="v1" filtriIniziali={FILTRI_DEFAULT} />)
    await attendiChe(() => testoDellaPagina().includes('DITTA 1'), 'le righe')

    expect(document.querySelectorAll('button[aria-label="Collega fattura"]')).toHaveLength(1)
    expect(document.querySelectorAll('button[aria-label="Scollega"]')).toHaveLength(2)
    expect(testoDellaPagina()).toContain('40,00') // il residuo accanto allo stato parziale

    await cliccare(document.querySelector('button[aria-label="Collega fattura"]'))
    await attendiChe(() => testoDellaPagina().includes('Collega fattura') && testoDellaPagina().includes('Fattura / scadenza'), 'il dialogo Collega')

    // Scollega chiede conferma e poi chiama la rotta.
    await cliccare(document.querySelectorAll('button[aria-label="Scollega"]')[0])
    await attendiChe(() => testoDellaPagina().includes('Scollegare il movimento?'), 'la conferma')
    await cliccare(perTesto('Scollega', '[role="alertdialog"] button'))
    await attendiChe(() => richieste.some((r) => r.url === '/api/bank-transactions/3/scollega' && r.init?.method === 'POST'), 'la rotta di scollegamento')
  })
})
