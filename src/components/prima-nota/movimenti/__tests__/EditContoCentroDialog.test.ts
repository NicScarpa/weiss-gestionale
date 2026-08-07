import { describe, it, expect } from 'vitest'
import { buildReclassifyPayload } from '../EditContoCentroDialog'

// NOTA: nessuna infrastruttura di test per il rendering di componenti React
// in questo progetto (vedi report Task 11/12). L'unica logica non banale del
// dialog — quali chiavi mandare alla PUT di riclassifica — è verificata qui
// come funzione pura.
//
// È il punto più delicato del Task 15: la route (Task 8) rifiuta con 400
// qualunque chiave diversa da accountId/costCenterId sui movimenti da
// chiusura (MOVIMENTO_DA_CHIUSURA_SOLO_RICLASSIFICA), quindi il payload non
// deve MAI contenerne altre.

const ORIGINAL = { accountId: 'conto-1', costCenterId: 'centro-1' }

describe('buildReclassifyPayload', () => {
  it('non invia nulla se conto e centro non cambiano', () => {
    const payload = buildReclassifyPayload(ORIGINAL, {
      accountId: 'conto-1',
      costCenterId: 'centro-1',
    })
    expect(payload).toEqual({})
  })

  it('invia solo accountId quando cambia solo il conto', () => {
    const payload = buildReclassifyPayload(ORIGINAL, {
      accountId: 'conto-2',
      costCenterId: 'centro-1',
    })
    expect(payload).toEqual({ accountId: 'conto-2' })
    expect(Object.keys(payload)).toEqual(['accountId'])
  })

  it('invia solo costCenterId quando cambia solo il centro', () => {
    const payload = buildReclassifyPayload(ORIGINAL, {
      accountId: 'conto-1',
      costCenterId: 'centro-2',
    })
    expect(payload).toEqual({ costCenterId: 'centro-2' })
    expect(Object.keys(payload)).toEqual(['costCenterId'])
  })

  it('invia entrambi i campi quando cambiano entrambi, e mai altre chiavi', () => {
    const payload = buildReclassifyPayload(ORIGINAL, {
      accountId: 'conto-2',
      costCenterId: 'centro-2',
    })
    expect(payload).toEqual({ accountId: 'conto-2', costCenterId: 'centro-2' })
    expect(Object.keys(payload).sort()).toEqual(['accountId', 'costCenterId'])
  })

  it('rappresenta "Nessuno" come costCenterId: null esplicito, non omesso', () => {
    const payload = buildReclassifyPayload(ORIGINAL, {
      accountId: 'conto-1',
      costCenterId: undefined,
    })
    // JSON.stringify scarterebbe una chiave undefined: qui deve restare
    // esplicitamente null, altrimenti il server la leggerebbe come "nessun
    // cambiamento" invece che "azzeralo".
    expect(payload).toEqual({ costCenterId: null })
    expect(JSON.stringify(payload)).toContain('"costCenterId":null')
  })

  it('non invia accountId se la selezione è vuota (nessun conto scelto)', () => {
    const payload = buildReclassifyPayload(ORIGINAL, {
      accountId: undefined,
      costCenterId: 'centro-1',
    })
    expect(payload).toEqual({})
  })

  it('il payload non contiene mai chiavi diverse da accountId/costCenterId', () => {
    const payload = buildReclassifyPayload(ORIGINAL, {
      accountId: 'conto-2',
      costCenterId: undefined,
    })
    const chiaviAmmesse = ['accountId', 'costCenterId']
    for (const chiave of Object.keys(payload)) {
      expect(chiaviAmmesse).toContain(chiave)
    }
  })
})
