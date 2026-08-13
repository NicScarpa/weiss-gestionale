import { describe, it, expect } from 'vitest'
import { mascheraIban } from '../maschere'

describe('mascheraIban', () => {
  it('tiene il paese e le ultime quattro cifre', () => {
    expect(mascheraIban('IT60X0542811101000000123456')).toBe('IT•• •••• 3456')
  })

  it('ignora gli spazi con cui le banche stampano gli IBAN', () => {
    expect(mascheraIban('it60 x054 2811 1010 0000 0123 456')).toBe('IT•• •••• 3456')
  })

  // Un IBAN troppo corto è un dato sbagliato, non un motivo per mostrarlo
  // intero: nel dubbio non si consegna nulla.
  it('non lascia trapelare nulla di un valore troppo corto', () => {
    expect(mascheraIban('IT60X')).toBe('••••')
  })
})
