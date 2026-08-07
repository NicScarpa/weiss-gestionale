import { describe, it, expect } from 'vitest'
import { groupByMastro, buildSearchValue, type AccountComboboxItem } from '../AccountCombobox'
import type { ComboboxAccount } from '@/hooks/useImputableAccounts'

// NOTA: @testing-library/react è in package.json ma non è mai stato
// funzionante in questo progetto — la sua peer dependency
// @testing-library/dom non è mai stata aggiunta (vedi report Task 11).
// Nessun componente React ha test di rendering nel repo. Per non introdurre
// nuova infrastruttura di test, qui si verifica come funzione pura la logica
// non banale del componente (raggruppamento per mastro e valore di ricerca
// passato a cmdk); l'interazione DOM (apertura popover, click, digitazione)
// resta da coprire manualmente quando il componente viene collegato nei
// punti d'uso (Task 12/17).

const CONTO_BIRRA: ComboboxAccount = {
  id: 'conto-birra',
  code: '20.1.01',
  name: 'Birra fusto',
  type: 'COSTO',
  mastroCode: '20',
  mastroNome: 'Materie prime, sussidiarie e merci',
  gruppoCode: '20.1',
  gruppoNome: 'Beverage alcolico',
  costCenterRule: 'DEFAULT_STR',
}

const CONTO_VINO: ComboboxAccount = {
  ...CONTO_BIRRA,
  id: 'conto-vino',
  code: '20.1.02',
  name: 'Vino',
}

const CONTO_AFFITTO: ComboboxAccount = {
  id: 'conto-affitto',
  code: '61.1.01',
  name: 'Affitto locali',
  type: 'COSTO',
  mastroCode: '61',
  mastroNome: 'Servizi',
  gruppoCode: '61.1',
  gruppoNome: 'Locazioni',
  costCenterRule: 'OBBLIGATORIO',
}

const CONTO_PATRIMONIALE: ComboboxAccount = {
  id: 'conto-banca',
  code: '01.01',
  name: 'Banca c/c',
  type: 'ATTIVO',
  mastroCode: null,
  mastroNome: null,
  gruppoCode: null,
  gruppoNome: null,
  costCenterRule: 'DEFAULT_STR',
}

describe('groupByMastro', () => {
  it('raggruppa i conti per mastro con intestazione "codice — nome"', () => {
    const gruppi = groupByMastro([CONTO_BIRRA, CONTO_VINO, CONTO_AFFITTO])

    expect(gruppi).toHaveLength(2)
    expect(gruppi[0]).toMatchObject({
      key: '20',
      heading: '20 — Materie prime, sussidiarie e merci',
    })
    expect(gruppi[0].accounts.map((a) => a.id)).toEqual(['conto-birra', 'conto-vino'])
    expect(gruppi[1]).toMatchObject({ key: '61', heading: '61 — Servizi' })
  })

  it('mette sempre in fondo i conti senza mastro (patrimoniali/legacy)', () => {
    const gruppi = groupByMastro([CONTO_PATRIMONIALE, CONTO_BIRRA])

    expect(gruppi.map((g) => g.key)).toEqual(['20', '__senza_mastro__'])
    expect(gruppi[1].heading).toBe('Altri conti')
    expect(gruppi[1].accounts).toEqual([CONTO_PATRIMONIALE])
  })

  it('con la lista vuota non produce gruppi', () => {
    expect(groupByMastro([])).toEqual([])
  })
})

describe('buildSearchValue', () => {
  it('include code, name e gruppoNome', () => {
    expect(buildSearchValue(CONTO_BIRRA)).toBe('20.1.01 Birra fusto Beverage alcolico')
  })

  it('senza gruppoNome non lascia "undefined" nel valore', () => {
    expect(buildSearchValue(CONTO_PATRIMONIALE)).toBe('01.01 Banca c/c ')
  })

  it('il codice di gruppo (es. "20.1") è sempre prefisso del code dei conti figli: la ricerca per gruppo funziona di riflesso', () => {
    expect(buildSearchValue(CONTO_BIRRA).includes('20.1')).toBe(true)
    expect(buildSearchValue(CONTO_VINO).includes('20.1')).toBe(true)
    expect(buildSearchValue(CONTO_AFFITTO).includes('20.1')).toBe(false)
  })

  // Smoke richiesto dal brief Task 12: cercare "Birra" nel form movimento
  // deve poter trovare il conto "Birra fusto" del piano v4 (mastro 20). cmdk
  // fa match case-insensitive sul valore restituito da buildSearchValue, non
  // testabile end-to-end senza infrastruttura DOM (vedi nota in testa al
  // file): qui si verifica che il termine sia effettivamente presente nella
  // stringa di ricerca, come nel form movimento reale.
  it('"Birra" (case-insensitive) trova "Birra fusto" nella stringa di ricerca', () => {
    expect(buildSearchValue(CONTO_BIRRA).toLowerCase()).toContain('birra')
  })
})

describe('groupByMastro / buildSearchValue con lista fornita come prop (AccountComboboxItem minimale)', () => {
  // Forma usata da ExpensesSection (chiusura di cassa, Task 12): i conti
  // arrivano come prop SSR con solo {id, code, name}, senza gerarchia
  // mastro/gruppo. AccountComboboxList deve comunque funzionare, mettendo
  // tutto in un unico gruppo "Altri conti".
  const CONTO_MINIMALE: AccountComboboxItem = {
    id: 'conto-pulizie',
    code: '61.9.01',
    name: 'Pulizie',
  }

  it('un conto senza mastroCode/mastroNome/gruppoNome finisce in "Altri conti"', () => {
    const gruppi = groupByMastro([CONTO_MINIMALE])
    expect(gruppi).toEqual([
      { key: '__senza_mastro__', heading: 'Altri conti', accounts: [CONTO_MINIMALE] },
    ])
  })

  it('la stringa di ricerca non contiene "undefined" quando gruppoNome è assente', () => {
    expect(buildSearchValue(CONTO_MINIMALE)).toBe('61.9.01 Pulizie ')
  })
})
