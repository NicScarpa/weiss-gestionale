import { describe, it, expect } from 'vitest'
import { statoLegenda } from '../stato-legenda'

describe('statoLegenda — la legenda di CashKing sul nostro modello, letta dalla colonna', () => {
  it('senza scrittura è «Non abbinato», col residuo pari all\'importo', () => {
    expect(statoLegenda({ matchedEntryId: null, status: 'PENDING', amount: -68.93, residuoDocumenti: null })).toEqual({
      stato: 'non_abbinato',
      residuo: 68.93,
      proposta: false,
    })
  })

  // Il vecchio motore scrive matchedEntryId anche sulle proposte da rivedere:
  // una proposta non è un abbinamento, e si segnala col puntino.
  it('una proposta da rivedere è «Non abbinato» col puntino, anche se porta una scrittura', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'TO_REVIEW', amount: 100, residuoDocumenti: 0 })).toEqual({
      stato: 'non_abbinato',
      residuo: 100,
      proposta: true,
    })
  })

  it('collegata con documenti che non coprono tutto è «Parzialmente abbinato» col residuo', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MANUAL', amount: -100, residuoDocumenti: 40 })).toEqual({
      stato: 'parziale',
      residuo: 40,
      proposta: false,
    })
  })

  it('collegata dall\'utente, senza residuo, è «Abbinato manualmente»', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MANUAL', amount: -0.75, residuoDocumenti: 0 })).toEqual({
      stato: 'abbinato_manualmente',
      residuo: 0,
      proposta: false,
    })
  })

  it('collegata dal motore o da una proposta approvata, senza residuo, è «Riconciliato»', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MATCHED', amount: 907.9, residuoDocumenti: 0 })).toEqual({
      stato: 'riconciliato',
      residuo: 0,
      proposta: false,
    })
  })

  // Le righe agganciate prima della colonna, o dal vecchio motore senza
  // ricalcolo, hanno la colonna nulla: collegate senza documenti.
  it('una colonna nulla su una riga collegata vale zero', () => {
    expect(statoLegenda({ matchedEntryId: 'e1', status: 'MATCHED', amount: 10, residuoDocumenti: null }).stato).toBe('riconciliato')
  })
})
