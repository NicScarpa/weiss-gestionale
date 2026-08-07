import { describe, it, expect } from 'vitest'
import {
  resolveDefaultClosureCostCenterId,
  resolveEffectiveExpenseCostCenterId,
  getCostCenterCode,
  CLOSURE_DEFAULT_COST_CENTER_CODE,
} from '../closure-cost-center'
import type { CostCenterOption } from '@/components/prima-nota/shared/CostCenterSelect'

// NOTA: nessuna infrastruttura di test per il rendering di componenti React
// (vedi report Task 11/12/13). La logica non banale del Task 14 — quale
// centro preselezionare in testata, quale centro eredita effettivamente una
// riga spesa — è verificata qui come funzione pura.

const STR: CostCenterOption = { id: 'str-id', code: 'STR', name: 'Struttura', isDefault: true }
const WEISS: CostCenterOption = { id: 'weiss-id', code: 'WEISS', name: 'Weiss Cafè', isDefault: false }
const VV: CostCenterOption = { id: 'vv-id', code: 'VV', name: 'Villa Varda Bistrot', isDefault: false }
const CENTRI = [STR, WEISS, VV]

describe('resolveDefaultClosureCostCenterId', () => {
  it('preseleziona WEISS, non il centro di default del server (STR)', () => {
    expect(resolveDefaultClosureCostCenterId(CENTRI)).toBe('weiss-id')
  })

  it('il codice di default è WEISS', () => {
    expect(CLOSURE_DEFAULT_COST_CENTER_CODE).toBe('WEISS')
  })

  it('nessun WEISS in elenco: non inventa un default (undefined)', () => {
    expect(resolveDefaultClosureCostCenterId([STR, VV])).toBeUndefined()
  })

  it('elenco vuoto: undefined', () => {
    expect(resolveDefaultClosureCostCenterId([])).toBeUndefined()
  })
})

describe('getCostCenterCode', () => {
  it('trova il codice dato un id valido', () => {
    expect(getCostCenterCode(CENTRI, 'vv-id')).toBe('VV')
  })

  it('id assente: undefined senza lanciare', () => {
    expect(getCostCenterCode(CENTRI, undefined)).toBeUndefined()
  })

  it('id non presente nell\'elenco: undefined', () => {
    expect(getCostCenterCode(CENTRI, 'sconosciuto')).toBeUndefined()
  })
})

describe('resolveEffectiveExpenseCostCenterId', () => {
  it('override di riga presente: vince sulla testata', () => {
    expect(resolveEffectiveExpenseCostCenterId('vv-id', 'weiss-id')).toBe('vv-id')
  })

  it('override assente (undefined): eredita dalla testata', () => {
    expect(resolveEffectiveExpenseCostCenterId(undefined, 'weiss-id')).toBe('weiss-id')
  })

  it('override esplicito null (sentinella "Come chiusura"): eredita dalla testata', () => {
    expect(resolveEffectiveExpenseCostCenterId(null, 'weiss-id')).toBe('weiss-id')
  })

  it('né override né testata: undefined (rispecchia il fallback server-side a null)', () => {
    expect(resolveEffectiveExpenseCostCenterId(undefined, undefined)).toBeUndefined()
  })
})
