import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { BannerConsenso } from '../BannerConsenso'
// Stessi aiutanti usati dai test del pannello impostazioni: montano con
// `createRoot` + `act`, stubbano ciò che Radix usa e jsdom non ha, e forniscono
// il QueryClientProvider che `useQuery` dà per scontato.
import {
  installaStubDom,
  montare,
  smontare,
  attendere,
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
 * `ConnessioniBancarie.test.tsx`: `useQuery` risolve su una promise finta del
 * `fetch` stubbato, e un solo `attendere()` (due microtask) non basta a
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

/**
 * Un `fetch` finto che risponde per prefisso di indirizzo, come in
 * `ConnessioniBancarie.test.tsx`. Qui serve anche lo status, per simulare il
 * 403 che la rotta dà a chi non è amministratore.
 */
function stubFetch(risposte: Array<[string, unknown, number?]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const indirizzo = String(url)
      const trovata = risposte.find(([prefisso]) => indirizzo.startsWith(prefisso))
      const [, corpo, status] = trovata ?? ['', {}, 200]
      return new Response(JSON.stringify(corpo ?? {}), {
        status: status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    })
  )
}

/** Una connessione la cui scadenza cade fra `giorni` giorni (negativo = passata). */
function connessioneConScadenza(giorni: number) {
  return {
    connessione: {
      id: 'conn-1',
      istitutoNome: 'Banca della Marca',
      stato: { sigla: 'LN', nome: 'Collegata', spiegazione: 'Il consenso è attivo.' },
      scadeIl: new Date(Date.now() + giorni * 86_400_000).toISOString(),
    },
  }
}

describe('BannerConsenso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('non mostra nulla senza collegamento', async () => {
    stubFetch([['/api/gocardless/collegamenti', { connessione: null }]])

    await montare(<BannerConsenso />)
    await attendere()

    expect(document.body.querySelector('[role="alert"]')).toBeNull()
  })

  it('non mostra nulla se mancano più di quattordici giorni', async () => {
    stubFetch([['/api/gocardless/collegamenti', connessioneConScadenza(30)]])

    await montare(<BannerConsenso />)
    await attendere()

    expect(document.body.querySelector('[role="alert"]')).toBeNull()
  })

  it('avvisa quando mancano quattordici giorni o meno, dicendo quanti', async () => {
    stubFetch([['/api/gocardless/collegamenti', connessioneConScadenza(5)]])

    await montare(<BannerConsenso />)
    await attendere()
    await attendiChe(() => testoDellaPagina().includes('5 giorni'), "l'avviso a schermo")

    expect(testoDellaPagina()).toContain('5 giorni')
  })

  // Quello che si dimentica sempre: una sottrazione fra date senza un ramo
  // per il passato produce «fra -3 giorni», che non vuol dire niente a chi
  // legge.
  it('avvisa in modo diverso quando è già scaduto', async () => {
    stubFetch([['/api/gocardless/collegamenti', connessioneConScadenza(-3)]])

    await montare(<BannerConsenso />)
    await attendere()
    await attendiChe(() => document.body.querySelector('[role="alert"]') !== null, "l'avviso a schermo")

    const testo = testoDellaPagina()
    expect(testo).not.toMatch(/fra -\d+ giorni/)
    expect(testo.toLowerCase()).toContain('scadut')
  })

  // La rotta risponde solo agli amministratori: per chiunque altro arriva un
  // 403, indistinguibile qui da «nessun collegamento». Il banner deve restare
  // muto — non solo senza contenuto a schermo, ma anche senza rumore in
  // console, altrimenti ogni apertura della dashboard da parte dello staff
  // riempirebbe la console di un errore innocuo.
  it('resta muto e silenzioso quando la rotta risponde 403', async () => {
    stubFetch([['/api/gocardless/collegamenti', { error: 'Accesso negato' }, 403]])
    const erroreConsole = vi.spyOn(console, 'error').mockImplementation(() => {})

    await montare(<BannerConsenso />)
    await attendere()
    // Nessun segnale a schermo da aspettare (il banner resta muto per
    // costruzione): si dà comunque tempo alla query di risolversi con timer
    // veri, altrimenti l'asserzione «non ha stampato nulla» sarebbe vera solo
    // perché non ha ancora avuto il tempo di provarci.
    await act(async () => {
      await new Promise((risolvi) => setTimeout(risolvi, 20))
    })

    expect(document.body.querySelector('[role="alert"]')).toBeNull()
    expect(erroreConsole).not.toHaveBeenCalled()

    erroreConsole.mockRestore()
  })
})
