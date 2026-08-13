import { describe, it, expect } from 'vitest'
import { applicaUnicita } from '../unicita'
import { PESI, type Valutazione } from '../punteggio'

function valutazione(punteggioParziale = 70): Valutazione {
  return {
    fattori: {
      importo: 30,
      riferimento: 20,
      controparte: 20,
      data: 0,
      codiceBanca: 0,
      unicita: 0,
    },
    motivazioni: [],
    punteggioParziale,
  }
}

describe('applicaUnicita', () => {
  it('dà il massimo quando è l\'unico candidato, e lo dice', () => {
    const esito = applicaUnicita(valutazione(70), 1)
    expect(esito.fattori.unicita).toBe(PESI.UNICITA)
    expect(esito.punteggio).toBe(75)
    expect(esito.motivazioni.some((m) => m.segno === '+' && /unico/i.test(m.testo))).toBe(true)
  })

  it('dà poco con due candidati', () => {
    const esito = applicaUnicita(valutazione(70), 2)
    expect(esito.fattori.unicita).toBe(2)
    expect(esito.punteggio).toBe(72)
  })

  it('non dà nulla da tre candidati in su, e lo dice come motivazione negativa', () => {
    const esito = applicaUnicita(valutazione(70), 3)
    expect(esito.fattori.unicita).toBe(0)
    expect(esito.punteggio).toBe(70)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /alternative/i.test(m.testo))).toBe(true)
  })

  it('non supera mai 100', () => {
    const esito = applicaUnicita(valutazione(100), 1)
    expect(esito.punteggio).toBe(100)
  })

  it('non modifica la valutazione ricevuta', () => {
    const originale = valutazione(70)
    applicaUnicita(originale, 1)
    expect(originale.fattori.unicita).toBe(0)
    expect(originale.motivazioni).toHaveLength(0)
  })
})
