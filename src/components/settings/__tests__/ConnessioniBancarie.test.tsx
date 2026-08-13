import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { ConnessioniBancarie } from '../ConnessioniBancarie'
// Gli aiutanti vivono nella cartella di prova dello scadenzario: montano con
// `createRoot` + `act`, stubbano ciò che Radix usa e jsdom non ha, e forniscono
// il QueryClientProvider. Importarli di là evita una terza copia dello stesso file.
import {
  installaStubDom,
  montare,
  smontare,
  attendere,
  cliccare,
  scrivere,
  perTesto,
  perId,
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
})

/**
 * Attende una condizione, riprovando con timer veri.
 *
 * `attendere()` flusha solo due microtask: basta per una query sola, non per
 * questo pannello, dove la seconda query (i conti) si abilita solo dopo che
 * la prima (il collegamento) è tornata — la stessa flakiness già documentata
 * in `BudgetCategoryManagement.test.tsx` ("con dei semplici `attendere()` il
 * test passava o falliva a seconda di come cadevano i tempi"). Non è nel test
 * del brief così com'è scritto: aggiungerla è l'unico modo per farlo passare
 * in modo affidabile invece che a intermittenza.
 */
async function attendiChe(condizione: () => boolean, cosa: string): Promise<void> {
  for (let tentativo = 0; tentativo < 50; tentativo++) {
    if (condizione()) return
    await act(async () => {
      await new Promise((risolvi) => setTimeout(risolvi, 5))
    })
  }
  throw new Error(`Atteso invano: ${cosa}`)
}

/** Gli indirizzi chiamati, nell'ordine, per poter interrogare il traffico. */
let chiamate: string[] = []

/**
 * Un `fetch` finto che risponde per prefisso di indirizzo. Nessun IBAN vero
 * qui dentro: le forme mascherate sono inventate.
 */
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

const CONTI_DEL_GESTIONALE = [
  { id: 'ba-1', name: 'Banca della Marca — ordinario' },
  { id: 'ba-2', name: 'Banca della Marca — secondo' },
]

const COLLEGAMENTO = {
  connessione: {
    id: 'conn-1',
    istitutoNome: 'Banca della Marca',
    stato: { sigla: 'LN', nome: 'Collegata', spiegazione: 'Il consenso è attivo.' },
    scadeIl: '2026-12-01T00:00:00.000Z',
  },
}

const CONTI = {
  stato: { sigla: 'LN', nome: 'Collegata', spiegazione: 'Il consenso è attivo.' },
  lettiIl: '2026-08-13T08:00:00.000Z',
  conti: [
    {
      tipo: 'riconosciuto',
      bankAccountId: 'ba-1',
      nomeConto: 'Banca della Marca — ordinario',
      conto: { providerAccountId: 'acc-1', iban: null, ibanHash: 'h1', intestatario: 'WEISS SRL', valuta: 'EUR' },
      ibanMascherato: 'IT•• •••• 1111',
      ultimoMovimento: '2026-07-31T00:00:00.000Z',
      syncEnabled: true,
      syncCutoffDate: '2026-08-01',
    },
    {
      tipo: 'sconosciuto',
      conto: { providerAccountId: 'acc-2', iban: null, ibanHash: 'h2', intestatario: null, valuta: 'EUR' },
      ibanMascherato: 'IT•• •••• 2222',
      ultimoMovimento: null,
      syncEnabled: false,
      syncCutoffDate: null,
    },
  ],
}

/** Gli interruttori a schermo, nell'ordine in cui compaiono. */
function interruttori(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="switch"]'))
}

describe('ConnessioniBancarie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('senza collegamento invita a collegarne uno', async () => {
    stubFetch([['/api/gocardless/collegamenti', { connessione: null }]])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()

    expect(perTesto(/collega la banca/i)).toBeTruthy()
  })

  // Una lettura forzata costa una chiamata per conto su un contingente di
  // quattro al giorno: quattro aperture del pannello lo esaurirebbero, e la
  // quinta non mostrerebbe nulla. L'aggiornamento è un gesto, non un effetto
  // del montaggio.
  it('al montaggio non chiede mai un aggiornamento forzato', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/conti')),
      'la lettura dei conti del collegamento'
    )

    expect(chiamate.length).toBeGreaterThan(0)
    expect(chiamate.some((u) => u.includes('aggiorna=1'))).toBe(false)
  })

  it('con un collegamento mostra istituto, scadenza e conti', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('IT•• •••• 2222'), 'il secondo conto a schermo')

    const testo = testoDellaPagina()
    expect(testo).toContain('Banca della Marca')
    expect(testo).toContain('01/12/2026')
    expect(testo).toContain('IT•• •••• 1111')
    expect(testo).toContain('IT•• •••• 2222')

    // Il conto già acceso deve risultare acceso: se il pannello ripartisse
    // spento, salvare lo spegnerebbe senza che nessuno l'abbia chiesto.
    expect(interruttori()[0]?.getAttribute('data-state')).toBe('checked')
  })

  // `configura` esige la data di taglio anche a interruttore spento, ed è
  // l'unica cosa che impedisce a un movimento già importato via CSV di
  // entrare una seconda volta.
  //
  // Le due asserzioni servono **entrambe**: «Salva» è disabilitato anche
  // quando non è cambiato nulla, quindi la prima da sola passerebbe pure se il
  // clic sull'interruttore non avesse alcun effetto. È la seconda — riempita
  // la data, il pulsante si accende — a dimostrare che il clic è arrivato e
  // che era la data a tenerlo chiuso.
  it('senza data di taglio non lascia salvare, con la data sì', async () => {
    const contiSenzaData = {
      ...CONTI,
      conti: [{ ...CONTI.conti[0], syncEnabled: false, syncCutoffDate: null }],
    }
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', contiSenzaData],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => interruttori().length > 0, "l'interruttore del conto a schermo")

    await cliccare(interruttori()[0])
    expect((perTesto(/^salva$/i) as HTMLButtonElement).disabled).toBe(true)

    await scrivere(perId('taglio-acc-1'), '2026-08-01')
    expect((perTesto(/^salva$/i) as HTMLButtonElement).disabled).toBe(false)
  })
})
