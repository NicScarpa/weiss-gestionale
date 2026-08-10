import { describe, it, expect } from 'vitest'
import { abbinaMemoria, codiciNonIdentificanti } from '../memoria-match'

const pane = { nomeNormalizzato: 'pane caserecio 1kg', codiceArticolo: 'GR01', accountId: 'conto-pane' }
const detersivo = {
  nomeNormalizzato: 'detersivo piatti 5l',
  codiceArticolo: 'GR01',
  accountId: 'conto-pulizia',
}
const farina = { nomeNormalizzato: 'farina 00 25kg', codiceArticolo: 'FAR25', accountId: 'conto-farina' }

describe('codiciNonIdentificanti', () => {
  it('un codice portato da righe con nomi diversi non identifica un prodotto', () => {
    const codici = codiciNonIdentificanti([
      { nomeNormalizzato: 'pane caserecio 1kg', codiceArticolo: 'GR01' },
      { nomeNormalizzato: 'detersivo piatti 5l', codiceArticolo: 'GR01' },
      { nomeNormalizzato: 'farina 00 25kg', codiceArticolo: 'FAR25' },
    ])

    expect([...codici]).toEqual(['GR01'])
  })

  it('lo stesso prodotto su due righe (consegna spezzata) non rende il codice sospetto', () => {
    const codici = codiciNonIdentificanti([
      { nomeNormalizzato: 'farina 00 25kg', codiceArticolo: 'FAR25' },
      { nomeNormalizzato: 'farina 00 25kg', codiceArticolo: 'FAR25' },
    ])

    expect(codici.size).toBe(0)
  })

  it('le righe senza codice non contano', () => {
    const codici = codiciNonIdentificanti([
      { nomeNormalizzato: 'pane', codiceArticolo: null },
      { nomeNormalizzato: 'zucchero', codiceArticolo: null },
    ])

    expect(codici.size).toBe(0)
  })
})

describe('abbinaMemoria', () => {
  const nessunCodiceSospetto = new Set<string>()

  it('il nome esatto vince sul codice articolo', () => {
    // La memoria del pane porta il codice GR01, e anche la riga della farina
    // lo porta: se il codice avesse la precedenza, la farina finirebbe sul
    // conto del pane pur esistendo la sua memoria esatta.
    const esito = abbinaMemoria({
      riga: { nomeNormalizzato: 'farina 00 25kg', codiceArticolo: 'GR01' },
      memorie: [pane, farina],
      codiciNonIdentificanti: nessunCodiceSospetto,
    })

    expect(esito).toEqual({ accountId: 'conto-farina', certezza: 'nome' })
  })

  it('senza memoria per il nome, un codice portato da una sola memoria abbina — ma con certezza minore', () => {
    const esito = abbinaMemoria({
      riga: { nomeNormalizzato: 'farina tipo 00 sacco', codiceArticolo: 'FAR25' },
      memorie: [pane, farina],
      codiciNonIdentificanti: nessunCodiceSospetto,
    })

    expect(esito).toEqual({ accountId: 'conto-farina', certezza: 'codice' })
  })

  it('due memorie con lo stesso codice: nessun abbinamento, non un abbinamento a caso', () => {
    // Oggi `find` restituirebbe la prima riga che il database gli passa,
    // in un ordine che nessuno controlla.
    const esito = abbinaMemoria({
      riga: { nomeNormalizzato: 'olio di semi 5l', codiceArticolo: 'GR01' },
      memorie: [pane, detersivo],
      codiciNonIdentificanti: nessunCodiceSospetto,
    })

    expect(esito).toBeUndefined()
  })

  it('un codice che nella fattura stessa copre prodotti diversi non abbina', () => {
    const esito = abbinaMemoria({
      riga: { nomeNormalizzato: 'olio di semi 5l', codiceArticolo: 'GR01' },
      memorie: [pane],
      codiciNonIdentificanti: new Set(['GR01']),
    })

    expect(esito).toBeUndefined()
  })

  it('riga senza codice articolo: resta solo il nome', () => {
    expect(
      abbinaMemoria({
        riga: { nomeNormalizzato: 'farina 00 25kg', codiceArticolo: null },
        memorie: [farina],
        codiciNonIdentificanti: nessunCodiceSospetto,
      })
    ).toEqual({ accountId: 'conto-farina', certezza: 'nome' })

    expect(
      abbinaMemoria({
        riga: { nomeNormalizzato: 'prodotto mai visto', codiceArticolo: null },
        memorie: [farina],
        codiciNonIdentificanti: nessunCodiceSospetto,
      })
    ).toBeUndefined()
  })

  it('prodotto sconosciuto senza codice noto: nessun abbinamento', () => {
    expect(
      abbinaMemoria({
        riga: { nomeNormalizzato: 'prodotto mai visto', codiceArticolo: 'XYZ' },
        memorie: [pane, farina],
        codiciNonIdentificanti: nessunCodiceSospetto,
      })
    ).toBeUndefined()
  })

  it('una memoria senza codice non abbina per codice nemmeno se la riga ne ha uno vuoto', () => {
    const senzaCodice = { nomeNormalizzato: 'zucchero', codiceArticolo: null, accountId: 'conto-z' }

    expect(
      abbinaMemoria({
        riga: { nomeNormalizzato: 'altro', codiceArticolo: '' },
        memorie: [senzaCodice],
        codiciNonIdentificanti: nessunCodiceSospetto,
      })
    ).toBeUndefined()
  })
})
