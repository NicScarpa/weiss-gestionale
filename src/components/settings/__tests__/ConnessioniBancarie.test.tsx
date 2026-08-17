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
  cliccareTreVolte,
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

/**
 * Una connessione la cui scadenza cade fra `giorni` giorni. Stesso schema di
 * `connessioneConScadenza` in `BannerConsenso.test.tsx`: costruita su
 * `Date.now()` invece di una data fissa, così il test resta valido qualunque
 * sia il giorno in cui gira.
 */
function collegamentoInScadenza(giorni: number) {
  return {
    connessione: {
      id: 'conn-1',
      istitutoNome: 'Banca della Marca',
      stato: { sigla: 'LN', nome: 'Collegata', spiegazione: 'Il consenso è attivo.' },
      scadeIl: new Date(Date.now() + giorni * 86_400_000).toISOString(),
    },
  }
}

/** Risposta minima dei conti, sufficiente quando il test non guarda l'elenco. */
const CONTI_VUOTI = { stato: { sigla: 'LN', nome: 'Collegata', spiegazione: '' }, lettiIl: null, conti: [] }

// Rifiutata: non ha mai avuto una scadenza (`accessValidUntil` si scrive solo
// quando lo stato diventa 'LN'), quindi `scadeIl` è `null` per costruzione —
// non un dettaglio del fixture, è come la rotta risponde davvero per questo
// stato.
const COLLEGAMENTO_RIFIUTATO = {
  connessione: {
    id: 'conn-1',
    istitutoNome: 'Banca della Marca',
    stato: { sigla: 'RJ', nome: 'Rifiutata', spiegazione: 'La banca ha rifiutato il consenso. Va rifatto da capo.' },
    scadeIl: null,
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

  // La frase «Nessuna sincronizzazione è attiva… i movimenti arriveranno con
  // il passo successivo» era vera nella Fase 2b e falsa dalla Fase 3: il 16
  // agosto stava sopra un blocco che diceva «ultima sincronizzazione riuscita»,
  // e chi leggeva ha concluso che i movimenti non fossero arrivati da nessuna
  // parte. Il pannello deve dire dove finiscono, non che non partono.
  it('dice dove finiscono i movimenti scaricati, non che nessuno li scarica', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('IT•• •••• 2222'), 'i conti a schermo')

    const testo = testoDellaPagina()
    expect(testo).not.toContain('Nessuna sincronizzazione è attiva')
    expect(testo).toContain('movimenti bancari della prima nota')
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

  // `conto.tipo === 'ignorato'` è il dato del server: non cambia finché non
  // arriva una rilettura. Abbinare un conto del gestionale a una riga
  // ignorata deve aprirla alla stessa riga piena (interruttore + data) del
  // conto sconosciuto — non lasciarla bloccata sulla sola select, altrimenti
  // `dataTaglio` resta vuoto per sempre e quella riga da sola disabilita
  // «Salva» per l'intero pannello.
  it('un conto ignorato si sblocca abbinandolo, con la data', async () => {
    const contoIgnorato = {
      tipo: 'ignorato',
      conto: { providerAccountId: 'acc-3', iban: null, ibanHash: 'h3', intestatario: null, valuta: 'EUR' },
      ibanMascherato: 'IT•• •••• 3333',
      ultimoMovimento: null,
      syncEnabled: false,
      syncCutoffDate: null,
    }
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', { ...CONTI, conti: [contoIgnorato] }],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('IT•• •••• 3333'), 'il conto ignorato a schermo')

    // Prima dell'abbinamento non c'è ancora un campo data: solo la select.
    expect(perId('taglio-acc-3')).toBeNull()

    await cliccare(document.body.querySelector<HTMLElement>('button[role="combobox"]'))
    await attendiChe(() => document.body.querySelector('[role="option"]') !== null, 'le opzioni della select')
    await cliccare(document.body.querySelector<HTMLElement>('[role="option"]'))

    // Abbinato: la riga si apre al campo data, e senza compilarlo «Salva»
    // resta chiuso.
    await attendiChe(() => perId('taglio-acc-3') !== null, "il campo data dopo l'abbinamento")
    expect((perTesto(/^salva$/i) as HTMLButtonElement).disabled).toBe(true)

    await scrivere(perId('taglio-acc-3'), '2026-08-01')
    expect((perTesto(/^salva$/i) as HTMLButtonElement).disabled).toBe(false)
  })

  // Il banner della dashboard porta qui, dove l'avviso di scadenza compariva
  // già ma senza nulla da premere: il giro si chiudeva a metà. La rotta di
  // rinnovo esisteva dal Task 2 e nessun componente la chiamava.
  it('con una scadenza vicina compare «Rinnova il consenso», e premendolo parte la richiesta giusta', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI_VUOTI],
      ['/api/gocardless/collegamenti', collegamentoInScadenza(5)],
      ['/api/gocardless/collegamenti/conn-1/rinnovo', { link: 'https://banca.test/consenso/rinnovo' }],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Rinnova il consenso'), "l'avviso di scadenza")

    await cliccare(perTesto(/rinnova il consenso/i))
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/rinnovo')),
      'la richiesta di rinnovo'
    )

    expect(chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/rinnovo'))).toBe(true)
  })

  // La POST non è ripetibile: apre una pratica di consenso vera presso la
  // banca, sul contingente di quattro chiamate al giorno. Stesso test di
  // WizardCollegamento.test.tsx ("tre clic ravvicinati... mandano una sola
  // richiesta"), sullo stesso meccanismo (`rinnovoInCorso`, un ref sincrono).
  it('tre clic ravvicinati su «Rinnova il consenso» mandano una sola richiesta', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI_VUOTI],
      ['/api/gocardless/collegamenti', collegamentoInScadenza(5)],
      ['/api/gocardless/collegamenti/conn-1/rinnovo', { link: 'https://banca.test/consenso/rinnovo' }],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Rinnova il consenso'), "l'avviso di scadenza")

    await cliccareTreVolte(perTesto(/rinnova il consenso/i))
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/rinnovo')),
      'la richiesta di rinnovo'
    )
    // Le tre chiamate erano sincrone (nello stesso giro): un altro giro di
    // attesa esclude che una quarta arrivi in ritardo dopo la prima.
    await attendere()

    expect(chiamate.filter((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/rinnovo')).length).toBe(1)
  })

  // Un collegamento rifiutato non ha mai una data di scadenza: senza questo,
  // `inScadenza` (che guarda solo la data) non lo intercetta mai, e il
  // pannello si limiterebbe a dire «va rifatto da capo» nel sottotitolo,
  // senza offrire nulla da premere.
  it('un collegamento da rifare offre «Rinnova il consenso» anche senza una scadenza vicina', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI_VUOTI],
      ['/api/gocardless/collegamenti', COLLEGAMENTO_RIFIUTATO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Rinnova il consenso'), "l'avviso di rinnovo")

    expect(perTesto(/rinnova il consenso/i)).toBeTruthy()
  })

  // A differenza del wizard (dove `setStep('viaggio')` smonta il pulsante),
  // qui l'avviso resta a schermo dopo un rinnovo riuscito: se la guardia si
  // riaprisse sul successo, un secondo clic mentre il browser sta ancora
  // navigando verso la banca manderebbe una seconda POST /rinnovo.
  it('dopo un rinnovo riuscito il pulsante resta disabilitato: un secondo clic non manda una seconda richiesta', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI_VUOTI],
      ['/api/gocardless/collegamenti', collegamentoInScadenza(5)],
      ['/api/gocardless/collegamenti/conn-1/rinnovo', { link: 'https://banca.test/consenso/rinnovo' }],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Rinnova il consenso'), "l'avviso di scadenza")

    await cliccare(perTesto(/rinnova il consenso/i))
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/rinnovo')),
      'la richiesta di rinnovo'
    )
    await attendere()

    const pulsante = perTesto(/rinnova il consenso/i) as HTMLButtonElement
    expect(pulsante.disabled).toBe(true)

    await cliccare(pulsante)
    await attendere()

    expect(chiamate.filter((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/rinnovo')).length).toBe(1)
  })

  // `aggiornaDallaBanca` deve scrivere il corpo già ricevuto direttamente in
  // cache: se richiamasse `ricaricaConti()`, una seconda GET su `.../conti`
  // (senza `aggiorna=1`) partirebbe subito dopo — inutile sul percorso
  // normale (risponde dalla memoria), ma una seconda chiamata vera alla banca
  // quando la memoria non è ancora scritta.
  it('«Aggiorna dalla banca» non rilegge una seconda volta', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('IT•• •••• 2222'), 'il secondo conto a schermo')

    await cliccare(perTesto(/aggiorna dalla banca/i))
    await attendiChe(() => chiamate.some((u) => u.includes('aggiorna=1')), 'la richiesta con aggiorna=1')
    await attendere()

    const chiamateConti = chiamate.filter((u) => u.startsWith('/api/gocardless/collegamenti/conn-1/conti'))
    // Il montaggio (senza aggiorna=1) più il clic (con aggiorna=1): due, non
    // tre.
    expect(chiamateConti.length).toBe(2)
  })
})
