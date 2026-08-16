import { describe, it, expect } from 'vitest'
import { statoLegenda } from '../stato-legenda'

describe('statoLegenda', () => {
  it('senza scrittura è Non abbinato, e il residuo è l\'intero importo', () => {
    expect(statoLegenda({ matchedEntryId: null, status: 'PENDING', amount: -120, importiRiconciliati: [] }))
      .toEqual({ stato: 'non_abbinato', residuo: 120 })
  })

  // Una commissione categorizzata ha una scrittura e nessun documento: è chiusa.
  it('con scrittura dell\'utente e senza documenti è Abbinato manualmente, residuo zero', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MANUAL', amount: -0.75, importiRiconciliati: [] }))
      .toEqual({ stato: 'abbinato_manualmente', residuo: 0 })
  })

  it('con scrittura del motore e documenti che coprono tutto è Riconciliato', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MATCHED', amount: -100, importiRiconciliati: [60, 40] }))
      .toEqual({ stato: 'riconciliato', residuo: 0 })
  })

  it('con documenti che coprono solo una parte è Parzialmente abbinato, col residuo', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MANUAL', amount: -100, importiRiconciliati: [30.5] }))
      .toEqual({ stato: 'parziale', residuo: 69.5 })
  })

  it('un centesimo di troppo dai documenti non manda il residuo sotto zero', () => {
    expect(statoLegenda({ matchedEntryId: 'je1', status: 'MATCHED', amount: 100, importiRiconciliati: [100.01] }).residuo).toBe(0)
  })
})
