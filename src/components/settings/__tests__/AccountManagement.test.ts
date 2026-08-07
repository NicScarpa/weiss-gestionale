import { describe, it, expect } from 'vitest'
import { getMastroOptions, getGruppoOptions } from '../AccountManagement'

// NOTA: come per AccountCombobox (Task 11), il progetto non ha
// un'infrastruttura funzionante per il rendering dei componenti React
// (@testing-library/dom manca come dipendenza, vedi report Task 11). Qui si
// verifica come funzione pura la logica non banale introdotta dal form del
// Task 18: la derivazione delle opzioni mastro/gruppo dai conti già
// caricati ("SELECT DISTINCT dei dati" richiesto dal brief).

function contoDiTest(overrides: Partial<Parameters<typeof getMastroOptions>[0][number]>) {
  return {
    id: 'id',
    code: '00.00',
    name: 'Conto di test',
    type: 'COSTO' as const,
    category: null,
    parentId: null,
    parent: null,
    mastroCode: null,
    mastroNome: null,
    gruppoCode: null,
    gruppoNome: null,
    costCenterRule: 'DEFAULT_STR' as const,
    isActive: true,
    _count: { expenses: 0, journalEntries: 0 },
    ...overrides,
  }
}

const BIRRA = contoDiTest({
  id: 'birra',
  code: '20.1.01',
  type: 'COSTO',
  mastroCode: '20',
  mastroNome: 'Materie prime, sussidiarie e merci',
  gruppoCode: '20.1',
  gruppoNome: 'Beverage alcolico',
})

const VINO = contoDiTest({
  id: 'vino',
  code: '20.1.05',
  type: 'COSTO',
  mastroCode: '20',
  mastroNome: 'Materie prime, sussidiarie e merci',
  gruppoCode: '20.1',
  gruppoNome: 'Beverage alcolico',
})

const CAFFE = contoDiTest({
  id: 'caffe',
  code: '20.3.01',
  type: 'COSTO',
  mastroCode: '20',
  mastroNome: 'Materie prime, sussidiarie e merci',
  gruppoCode: '20.3',
  gruppoNome: 'Caffetteria',
})

const AFFITTO = contoDiTest({
  id: 'affitto',
  code: '27.01',
  type: 'COSTO',
  mastroCode: '27',
  mastroNome: 'Godimento beni di terzi',
})

const CORRISPETTIVI = contoDiTest({
  id: 'corrispettivi',
  code: '10.01',
  type: 'RICAVO',
  mastroCode: '10',
  mastroNome: 'Ricavi delle vendite e delle prestazioni',
})

const BANCA = contoDiTest({
  id: 'banca',
  code: '110',
  type: 'ATTIVO',
  mastroCode: null,
  mastroNome: null,
})

const ACCOUNTS = [BIRRA, VINO, CAFFE, AFFITTO, CORRISPETTIVI, BANCA]

describe('getMastroOptions', () => {
  it('restituisce i mastri distinti del tipo richiesto, ordinati per codice', () => {
    expect(getMastroOptions(ACCOUNTS, 'COSTO')).toEqual([
      { code: '20', nome: 'Materie prime, sussidiarie e merci' },
      { code: '27', nome: 'Godimento beni di terzi' },
    ])
  })

  it('non mescola i mastri di tipi diversi', () => {
    expect(getMastroOptions(ACCOUNTS, 'RICAVO')).toEqual([
      { code: '10', nome: 'Ricavi delle vendite e delle prestazioni' },
    ])
  })

  it('i conti patrimoniali (mastroCode nullo) non producono opzioni', () => {
    expect(getMastroOptions(ACCOUNTS, 'ATTIVO')).toEqual([])
  })

  it('con la lista vuota non produce opzioni', () => {
    expect(getMastroOptions([], 'COSTO')).toEqual([])
  })
})

describe('getGruppoOptions', () => {
  it('restituisce i gruppi distinti del mastro richiesto, ordinati per codice', () => {
    expect(getGruppoOptions(ACCOUNTS, '20')).toEqual([
      { code: '20.1', nome: 'Beverage alcolico' },
      { code: '20.3', nome: 'Caffetteria' },
    ])
  })

  it('un mastro non articolato in gruppi non produce opzioni', () => {
    expect(getGruppoOptions(ACCOUNTS, '27')).toEqual([])
  })

  it('un mastro assente tra i conti non produce opzioni', () => {
    expect(getGruppoOptions(ACCOUNTS, '99')).toEqual([])
  })
})
