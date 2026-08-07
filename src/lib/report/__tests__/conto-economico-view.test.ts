import { describe, it, expect } from 'vitest'
import {
  determinaColonne,
  sommaRighe,
  senzaContoPerRiga,
  haSenzaConto,
  buildCsvMatrix,
  NON_ATTRIBUITO_LABEL,
} from '../conto-economico-view'
import { UNASSIGNED, type RigaContoEconomico } from '../conto-economico'

const CENTRI = [
  { code: 'STR', name: 'Struttura' },
  { code: 'WEISS', name: 'Weiss' },
]

function riga(overrides: Partial<RigaContoEconomico>): RigaContoEconomico {
  return {
    accountId: 'acc-1',
    code: '10.01',
    name: 'Corrispettivi',
    type: 'RICAVO',
    mastroCode: '10',
    mastroNome: 'Ricavi',
    gruppoCode: null,
    gruppoNome: null,
    amounts: { STR: 0, WEISS: 0, [UNASSIGNED]: 0 },
    total: 0,
    ...overrides,
  }
}

describe('determinaColonne', () => {
  it('include sempre i centri attivi, anche a zero', () => {
    const colonne = determinaColonne(CENTRI, [riga({})], {})
    expect(colonne).toEqual([
      { key: 'STR', label: 'Struttura' },
      { key: 'WEISS', label: 'Weiss' },
    ])
  })

  it('esclude "Non attribuito" se non compare mai un valore diverso da zero', () => {
    const colonne = determinaColonne(
      CENTRI,
      [riga({ amounts: { STR: 100, WEISS: 0, [UNASSIGNED]: 0 } })],
      {}
    )
    expect(colonne.some((c) => c.key === UNASSIGNED)).toBe(false)
  })

  it('include "Non attribuito" se una riga ha un valore diverso da zero in quella colonna', () => {
    const colonne = determinaColonne(
      CENTRI,
      [riga({ amounts: { STR: 0, WEISS: 0, [UNASSIGNED]: 50 } })],
      {}
    )
    expect(colonne).toContainEqual({ key: UNASSIGNED, label: NON_ATTRIBUITO_LABEL })
  })

  it('include "Non attribuito" se il netto senza conto ha un valore diverso da zero', () => {
    const colonne = determinaColonne(CENTRI, [riga({})], { [UNASSIGNED]: 30 })
    expect(colonne).toContainEqual({ key: UNASSIGNED, label: NON_ATTRIBUITO_LABEL })
  })

  it('non perde un centro che l\'aggregatore ha aperto ma che non è più fra quelli attivi', () => {
    // Es. un centro stagionale disattivato dopo il movimento: l'aggregatore
    // non lo perde (lo aggiunge come colonna dinamica), e la vista nemmeno.
    const colonne = determinaColonne(
      CENTRI,
      [riga({ amounts: { STR: 0, WEISS: 0, CAS_VECCHIO: 200, [UNASSIGNED]: 0 } })],
      { STR: 0, WEISS: 0, CAS_VECCHIO: 0, [UNASSIGNED]: 0 }
    )
    expect(colonne).toContainEqual({ key: 'CAS_VECCHIO', label: 'CAS_VECCHIO' })
    // e resta prima di "Non attribuito", che qui non compare perché a zero ovunque
    expect(colonne.map((c) => c.key)).toEqual(['STR', 'WEISS', 'CAS_VECCHIO'])
  })
})

describe('sommaRighe', () => {
  const colonne = [
    { key: 'STR', label: 'Struttura' },
    { key: 'WEISS', label: 'Weiss' },
  ]

  it('somma colonna per colonna e il totale, ignorando le chiavi assenti', () => {
    const righe = [
      riga({ amounts: { STR: 100, WEISS: 0 }, total: 100 }),
      riga({ amounts: { STR: 50, WEISS: 20 }, total: 70 }),
    ]
    const risultato = sommaRighe(righe, colonne)
    expect(risultato.amounts).toEqual({ STR: 150, WEISS: 20 })
    expect(risultato.total).toBe(170)
  })

  it('con lista vuota restituisce zero ovunque', () => {
    const risultato = sommaRighe([], colonne)
    expect(risultato.amounts).toEqual({ STR: 0, WEISS: 0 })
    expect(risultato.total).toBe(0)
  })
})

describe('senzaContoPerRiga', () => {
  it('inverte il segno di ogni colonna', () => {
    expect(senzaContoPerRiga({ STR: 150, WEISS: -40 })).toEqual({
      STR: -150,
      WEISS: 40,
    })
  })
})

describe('haSenzaConto', () => {
  it('è false se tutti i valori sono zero o l\'oggetto è vuoto', () => {
    expect(haSenzaConto({})).toBe(false)
    expect(haSenzaConto({ STR: 0, WEISS: 0 })).toBe(false)
  })

  it('è true se almeno un valore è diverso da zero', () => {
    expect(haSenzaConto({ STR: 0, WEISS: 150 })).toBe(true)
  })
})

describe('buildCsvMatrix', () => {
  const colonne = [
    { key: 'STR', label: 'Struttura' },
    { key: 'WEISS', label: 'Weiss' },
  ]

  const ricavo = riga({
    code: '10.01',
    name: 'Corrispettivi',
    type: 'RICAVO',
    amounts: { STR: 1000, WEISS: 0 },
    total: 1000,
  })
  const costo = riga({
    code: '20.1.01',
    name: 'Birra',
    type: 'COSTO',
    amounts: { STR: 0, WEISS: 300 },
    total: 300,
  })

  const totalsPerColonna = {
    STR: { ricavi: 1000, costi: 0, margine: 1000 },
    WEISS: { ricavi: 0, costi: 300, margine: -300 },
  }
  const totals = { ricavi: 1000, costi: 300, margine: 700 }

  it('costruisce intestazione, sezioni e riga margine, senza la riga senza conto se non serve', () => {
    const matrice = buildCsvMatrix({
      colonne,
      ricavi: [ricavo],
      costi: [costo],
      totalsPerColonna,
      totals,
      senzaContoRiga: { STR: 0, WEISS: 0 },
    })

    expect(matrice[0]).toEqual(['Codice', 'Voce', 'Struttura', 'Weiss', 'Totale'])
    expect(matrice).toContainEqual(['10.01', 'Corrispettivi', '1000.00', '0.00', '1000.00'])
    expect(matrice).toContainEqual(['', 'Totale Ricavi', '1000.00', '0.00', '1000.00'])
    expect(matrice).toContainEqual(['20.1.01', 'Birra', '0.00', '300.00', '300.00'])
    expect(matrice).toContainEqual(['', 'Totale Costi', '0.00', '300.00', '300.00'])
    expect(matrice).toContainEqual(['', 'MARGINE', '1000.00', '-300.00', '700.00'])
    expect(matrice.some((r) => r[1] === 'Movimenti senza conto (netto)')).toBe(false)
  })

  it('aggiunge la riga senza conto quando ha valori diversi da zero, con il segno già invertito', () => {
    const matrice = buildCsvMatrix({
      colonne,
      ricavi: [ricavo],
      costi: [costo],
      totalsPerColonna,
      totals,
      senzaContoRiga: senzaContoPerRiga({ STR: 0, WEISS: 150 }),
    })

    // senzaContoNetto WEISS = 150 (incasso) -> per riga diventa -150
    expect(matrice).toContainEqual(['', 'Movimenti senza conto (netto)', '0.00', '-150.00', '-150.00'])
  })
})
