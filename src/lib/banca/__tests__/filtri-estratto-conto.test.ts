import { describe, it, expect } from 'vitest'
import { filtriDaSearchParams, filtriInSearchParams, FILTRI_DEFAULT } from '../filtri-estratto-conto'

describe('filtriDaSearchParams', () => {
  it('senza parametri dà i default: Attivi, tutti, data decrescente, pagina 1 da 100', () => {
    expect(filtriDaSearchParams(new URLSearchParams())).toEqual(FILTRI_DEFAULT)
  })

  it('legge ordinamento, sezione, tipo e flag', () => {
    const f = filtriDaSearchParams(new URLSearchParams('ordina=importo&verso=asc&sezione=DELEGHE_F24&tipo=uscite&soloNonRiconciliati=1&page=2'))
    expect(f).toMatchObject({ ordina: 'importo', verso: 'asc', sezione: 'DELEGHE_F24', tipo: 'uscite', soloNonRiconciliati: true, page: 2 })
  })

  it('cestino=1 apre il Cestino', () => {
    expect(filtriDaSearchParams(new URLSearchParams('cestino=1')).cestino).toBe(true)
  })

  // Un URL sbagliato non deve rompere la pagina: torna ai default.
  it('un valore non valido cade sul default', () => {
    expect(filtriDaSearchParams(new URLSearchParams('ordina=colore&verso=su')).ordina).toBe('data')
  })
})

describe('filtriInSearchParams', () => {
  it('scrive solo ciò che differisce dai default e conserva i parametri altrui', () => {
    const base = new URLSearchParams('register=BANK')
    const sp = filtriInSearchParams({ ...FILTRI_DEFAULT, ordina: 'importo', verso: 'asc', page: 3 }, base)
    expect(sp.toString()).toBe('register=BANK&ordina=importo&verso=asc&page=3')
  })

  it('andata e ritorno conserva i filtri', () => {
    const f = { ...FILTRI_DEFAULT, cestino: true, search: 'worldline', dateFrom: '2026-07-01', bankAccountId: 'c1' }
    expect(filtriDaSearchParams(filtriInSearchParams(f))).toEqual(f)
  })

  it('«movimento» va e torna dall\'URL', () => {
    const f = filtriDaSearchParams(new URLSearchParams('movimento=abc123'))
    expect(f.movimento).toBe('abc123')
    expect(filtriInSearchParams(f).get('movimento')).toBe('abc123')
    expect(filtriInSearchParams({ ...f, movimento: undefined }).has('movimento')).toBe(false)
  })
})
