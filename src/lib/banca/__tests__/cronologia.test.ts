import { describe, it, expect } from 'vitest'
import { differenze } from '../cronologia'

const prima = { descrizione: 'ROSSI', causale: 'Bonifico', note: null, sezione: 'ATTIVI' }

describe('differenze', () => {
  it('registra solo i campi che cambiano', () => {
    expect(differenze(prima, { descrizione: 'Rossi S.r.l.', causale: 'Bonifico' })).toEqual([
      { campo: 'descrizione', prima: 'ROSSI', dopo: 'Rossi S.r.l.' },
    ])
  })
  it('un campo assente nel dopo non si tocca', () => {
    expect(differenze(prima, {})).toEqual([])
  })
  it('svuotare un campo è una modifica verso null', () => {
    expect(differenze(prima, { causale: null })).toEqual([{ campo: 'causale', prima: 'Bonifico', dopo: null }])
  })
})
