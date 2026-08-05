import { describe, it, expect } from 'vitest'
import { calcolaRitardoTipico } from '../stima-data-attesa'

describe('calcolaRitardoTipico', () => {
  it('restituisce la mediana dei ritardi con campione dispari', () => {
    expect(calcolaRitardoTipico([5, 12, 9])).toBe(9)
  })

  it('con campione pari usa la media dei due centrali, arrotondata', () => {
    expect(calcolaRitardoTipico([4, 6, 10, 20])).toBe(8)
  })

  it('la mediana è robusta a un caso anomalo', () => {
    // la fattura contestata pagata a 90 giorni non sposta la stima
    expect(calcolaRitardoTipico([7, 8, 9, 90])).toBe(9)
  })

  it('meno di 3 osservazioni: nessuna stima', () => {
    expect(calcolaRitardoTipico([10, 12])).toBeNull()
  })

  it('ritardo mediano sotto i 2 giorni è rumore: nessuna stima', () => {
    expect(calcolaRitardoTipico([0, 1, 1])).toBeNull()
  })

  it('il fornitore pagato in anticipo produce una stima negativa', () => {
    // |−5| ≥ 2: la stima anticipata è valida quanto quella in ritardo
    expect(calcolaRitardoTipico([-5, -4, -6])).toBe(-5)
  })

  it('non muta l\'array in ingresso', () => {
    const ritardi = [9, 5, 12]
    calcolaRitardoTipico(ritardi)
    expect(ritardi).toEqual([9, 5, 12])
  })
})
