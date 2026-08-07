import { describe, it, expect } from 'vitest'
import { accountTypesForEntryType } from '../MovimentoFormDialog'

// NOTA: nessuna infrastruttura di test per il rendering di componenti React
// in questo progetto (vedi report Task 11/12: @testing-library/dom non è
// mai stata configurata). Il filtro dinamico dei tipi di conto per tipo di
// movimento (Task 12) è l'unica logica non banale introdotta nel dialog:
// verificata qui come funzione pura.

describe('accountTypesForEntryType', () => {
  it('INCASSO propone solo conti di ricavo', () => {
    expect(accountTypesForEntryType('INCASSO')).toEqual(['RICAVO'])
  })

  it('USCITA propone solo conti di costo', () => {
    expect(accountTypesForEntryType('USCITA')).toEqual(['COSTO'])
  })

  it.each(['VERSAMENTO', 'PRELIEVO', 'GIROCONTO'] as const)(
    '%s propone sia ricavi che costi (trasferimenti tra cassa e banca)',
    (entryType) => {
      expect(accountTypesForEntryType(entryType)).toEqual(['RICAVO', 'COSTO'])
    }
  )
})
