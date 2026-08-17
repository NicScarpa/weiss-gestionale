import { describe, it, expect } from 'vitest'
import { calcolaResiduoDocumenti } from '../residuo-documenti'

describe('calcolaResiduoDocumenti', () => {
  it('senza riconciliazioni vale zero: una riga categorizzata senza documenti è chiusa', () => {
    expect(calcolaResiduoDocumenti(-68.93, [])).toBe(0)
  })

  it('è ciò che i documenti non coprono, sul valore assoluto della riga', () => {
    expect(calcolaResiduoDocumenti(-100, [60, 30])).toBe(10)
    expect(calcolaResiduoDocumenti(907.9, [907.9])).toBe(0)
  })

  it('non scende sotto zero e arrotonda a due decimali', () => {
    expect(calcolaResiduoDocumenti(-100, [100.004])).toBe(0)
    expect(calcolaResiduoDocumenti(-100, [33.333, 33.333])).toBe(33.33)
  })
})
