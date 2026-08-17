import { describe, it, expect } from 'vitest'
import { segnoDiPresentazione } from '../segno-documento'

describe('segnoDiPresentazione', () => {
  it('mostra in negativo le note di credito', () => {
    expect(segnoDiPresentazione('TD04', 164.33)).toBe(-164.33)
    expect(segnoDiPresentazione('TD08', 1900)).toBe(-1900)
  })

  it('lascia positive le fatture ordinarie', () => {
    expect(segnoDiPresentazione('TD01', 164.33)).toBe(164.33)
    expect(segnoDiPresentazione('TD24', 1143.41)).toBe(1143.41)
    expect(segnoDiPresentazione('TD06', 528.67)).toBe(528.67)
  })

  it('lascia positive le note di DEBITO, che aumentano il dovuto', () => {
    expect(segnoDiPresentazione('TD05', 100)).toBe(100)
    expect(segnoDiPresentazione('TD09', 100)).toBe(100)
  })

  it('non inverte due volte un documento gia negativo', () => {
    // Esiste davvero: IT03590860262_07UWS.xml.p7m e un TD01 da -70,00
    expect(segnoDiPresentazione('TD01', -70)).toBe(-70)
    expect(segnoDiPresentazione('TD04', -164.33)).toBe(-164.33)
  })

  it('regge lo zero senza produrre -0', () => {
    expect(Object.is(segnoDiPresentazione('TD04', 0), 0)).toBe(true)
  })
})
