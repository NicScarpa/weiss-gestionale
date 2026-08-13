import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { act } from 'react'
import { WizardCollegamento } from '../WizardCollegamento'
// Stessi aiutanti usati da ConnessioniBancarie.test.tsx: montano con
// `createRoot` + `act` e forniscono il QueryClientProvider che il wizard dà
// per scontato, essendo nell'albero dello stesso pannello.
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

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

afterEach(async () => {
  await smontare()
  vi.unstubAllGlobals()
})

/**
 * Attende una condizione, riprovando con timer veri. Stesso motivo di
 * `ConnessioniBancarie.test.tsx`: la query degli istituti risolve su una
 * promise finta, e un solo `attendere()` (due microtask) non basta a
 * garantire che il render successivo sia già avvenuto.
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

/** Un `fetch` finto che risponde per prefisso di indirizzo. */
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

const ISTITUZIONI = {
  istituzioni: [
    { id: 'ist-marca', nome: 'Banca della Marca', bic: null, giorniStorico: 90, giorniAccesso: 180 },
    { id: 'ist-altra', nome: 'Cassa Centrale', bic: null, giorniStorico: 730, giorniAccesso: 90 },
  ],
}

describe('WizardCollegamento', () => {
  it('cerca fra le banche e mostra i due numeri che contano', async () => {
    stubFetch([['/api/gocardless/istituzioni', ISTITUZIONI]])

    await montare(<WizardCollegamento aperto={true} onChiudi={vi.fn()} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Cassa Centrale'), "l'elenco degli istituti")

    await scrivere(perId('cerca-istituto'), 'marca')
    await attendere()

    const testo = testoDellaPagina()
    expect(testo).toContain('Banca della Marca')
    expect(testo).not.toContain('Cassa Centrale')
    expect(testo).toContain('90 giorni di storico')
    expect(testo).toContain('accesso valido 180 giorni')
  })

  // Il collegamento è irreversibile senza una nuova autenticazione: non deve
  // partire da un clic solo, ma solo dalla conferma esplicita del passo
  // successivo.
  it('non manda alla banca senza una conferma esplicita', async () => {
    stubFetch([
      ['/api/gocardless/istituzioni', ISTITUZIONI],
      ['/api/gocardless/collegamenti', { connessioneId: 'conn-9', link: 'https://banca.test/consenso' }],
    ])

    await montare(<WizardCollegamento aperto={true} onChiudi={vi.fn()} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Banca della Marca'), "l'elenco degli istituti")

    await cliccare(perTesto(/banca della marca/i))
    await attendere()

    // Scelto l'istituto: si è solo nel passo di conferma, nessuna richiesta è
    // ancora partita verso la banca.
    expect(chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti'))).toBe(false)
    expect(testoDellaPagina()).toContain('Vai alla banca')

    await cliccare(perTesto(/vai alla banca/i))
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti')),
      'la richiesta di collegamento'
    )

    expect(chiamate.filter((u) => u.startsWith('/api/gocardless/collegamenti')).length).toBe(1)
  })

  // La POST non è ripetibile: crea una richiesta di consenso vera presso la
  // banca, sul contingente di quattro chiamate al giorno. `setStep` da solo
  // non basta a fermare un doppio clic: si applica al render successivo, non
  // subito, e tre eventi di clic ravvicinati (rete lenta, tocco ripetuto)
  // arrivano tutti prima che React abbia rimontato il pulsante.
  it('tre clic ravvicinati su «Vai alla banca» mandano una sola richiesta', async () => {
    stubFetch([
      ['/api/gocardless/istituzioni', ISTITUZIONI],
      ['/api/gocardless/collegamenti', { connessioneId: 'conn-9', link: 'https://banca.test/consenso' }],
    ])

    await montare(<WizardCollegamento aperto={true} onChiudi={vi.fn()} />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('Banca della Marca'), "l'elenco degli istituti")

    await cliccare(perTesto(/banca della marca/i))
    await attendere()

    await cliccareTreVolte(perTesto(/vai alla banca/i))
    await attendiChe(
      () => chiamate.some((u) => u.startsWith('/api/gocardless/collegamenti')),
      'la richiesta di collegamento'
    )
    // Le tre chiamate erano sincrone (nello stesso giro): un solo
    // `attendiChe` non lascia margine perché una quarta arrivi in ritardo, ma
    // aggiungiamo comunque un giro di attesa per essere sicuri che non ne
    // arrivino altre dopo la prima.
    await attendere()

    expect(chiamate.filter((u) => u.startsWith('/api/gocardless/collegamenti')).length).toBe(1)
  })
})
