import { describe, it, expect } from 'vitest'
import { resolveCostCenterField, type CostCenterOption } from '../CostCenterSelect'

// NOTA: nessuna infrastruttura di test per il rendering di componenti React
// in questo progetto (vedi report Task 11/12). L'unica logica non banale del
// componente — quale centro proporre dato la regola del conto, senza mai
// sovrascrivere una scelta manuale — è verificata qui come funzione pura.

const STR: CostCenterOption = { id: 'str-id', code: 'STR', name: 'Struttura', isDefault: true }
const WEISS: CostCenterOption = { id: 'weiss-id', code: 'WEISS', name: 'Weiss', isDefault: false }
const CENTRI = [STR, WEISS]

describe('resolveCostCenterField', () => {
  it('DEFAULT_STR senza scelta manuale: preseleziona il centro di default e mostra l\'hint', () => {
    const result = resolveCostCenterField({
      rule: 'DEFAULT_STR',
      currentValue: undefined,
      hasManualSelection: false,
      costCenters: CENTRI,
    })
    expect(result.value).toBe('str-id')
    expect(result.hint).toContain('STR')
  })

  it('DEFAULT_STR ma l\'utente ha già scelto: non sovrascrive la scelta manuale', () => {
    const result = resolveCostCenterField({
      rule: 'DEFAULT_STR',
      currentValue: 'weiss-id',
      hasManualSelection: true,
      costCenters: CENTRI,
    })
    expect(result.value).toBe('weiss-id')
    expect(result.hint).toBeUndefined()
  })

  it('OBBLIGATORIO senza scelta: non propone alcun default (il submit lo bloccherà altrove)', () => {
    const result = resolveCostCenterField({
      rule: 'OBBLIGATORIO',
      currentValue: undefined,
      hasManualSelection: false,
      costCenters: CENTRI,
    })
    expect(result.value).toBeUndefined()
    expect(result.hint).toBeUndefined()
  })

  it('nessuna regola nota (conto non ancora selezionato): mantiene il valore corrente', () => {
    const result = resolveCostCenterField({
      rule: undefined,
      currentValue: 'weiss-id',
      hasManualSelection: false,
      costCenters: CENTRI,
    })
    expect(result.value).toBe('weiss-id')
    expect(result.hint).toBeUndefined()
  })

  it('DEFAULT_STR ma nessun centro di default configurato: nessun default inventato', () => {
    const result = resolveCostCenterField({
      rule: 'DEFAULT_STR',
      currentValue: undefined,
      hasManualSelection: false,
      costCenters: [WEISS], // nessun isDefault: true nella lista
    })
    expect(result.value).toBeUndefined()
    expect(result.hint).toBeUndefined()
  })

  it('la voce cambia dopo la scelta manuale: il nuovo conto è DEFAULT_STR ma la scelta precedente resta', () => {
    // L'utente aveva scelto WEISS per un conto OBBLIGATORIO; cambia conto e
    // il nuovo è DEFAULT_STR: non deve saltare a STR, la scelta è sua.
    const result = resolveCostCenterField({
      rule: 'DEFAULT_STR',
      currentValue: 'weiss-id',
      hasManualSelection: true,
      costCenters: CENTRI,
    })
    expect(result.value).toBe('weiss-id')
    expect(result.hint).toBeUndefined()
  })

  it('la voce cambia senza scelta manuale: da DEFAULT_STR (auto-assegnato) a OBBLIGATORIO, il valore auto-assegnato resta ma l\'hint sparisce', () => {
    // Prima il conto era DEFAULT_STR e aveva auto-assegnato STR (currentValue
    // riflette quell'assegnazione). Il conto cambia a uno OBBLIGATORIO: il
    // valore non viene azzerato, ma non è più presentato come "automatico".
    const result = resolveCostCenterField({
      rule: 'OBBLIGATORIO',
      currentValue: 'str-id',
      hasManualSelection: false,
      costCenters: CENTRI,
    })
    expect(result.value).toBe('str-id')
    expect(result.hint).toBeUndefined()
  })
})
