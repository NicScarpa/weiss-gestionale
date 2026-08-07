import { describe, it, expect } from 'vitest'
import { erroreCoerenzaGerarchia, erroreIncoerenzaConPianoUfficiale } from '../validate-account-hierarchy'

describe('erroreCoerenzaGerarchia', () => {
  it('codice coerente col mastro (nessun gruppo) non produce errore', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '21.01', mastroCode: '21', gruppoCode: null })
    ).toBeNull()
  })

  it('codice coerente col gruppo non produce errore', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '20.1.01', mastroCode: '20', gruppoCode: '20.1' })
    ).toBeNull()
  })

  it('nessun mastro né gruppo (conto patrimoniale/legacy): nessun vincolo sul codice', () => {
    expect(erroreCoerenzaGerarchia({ code: '100', mastroCode: null, gruppoCode: null })).toBeNull()
  })

  it('codice che contraddice il mastro dichiarato viene rifiutato', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '99.99', mastroCode: '20', gruppoCode: null })
    ).toBe('Il codice non è coerente con il mastro selezionato')
  })

  it('codice che contraddice il gruppo dichiarato viene rifiutato', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '20.3.01', mastroCode: '20', gruppoCode: '20.1' })
    ).toBe('Il codice non è coerente con il gruppo selezionato')
  })

  it('prefisso di stringa ingannevole ("201.01" col mastro "20") viene rifiutato', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '201.01', mastroCode: '20', gruppoCode: null })
    ).toBe('Il codice non è coerente con il mastro selezionato')
  })

  it('prefisso di stringa ingannevole sul gruppo ("20.10.01" col gruppo "20.1") viene rifiutato', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '20.10.01', mastroCode: '20', gruppoCode: '20.1' })
    ).toBe('Il codice non è coerente con il gruppo selezionato')
  })

  it('un gruppo senza mastro viene rifiutato prima ancora di guardare il codice', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '99.99', mastroCode: null, gruppoCode: '20.1' })
    ).toBe('Il gruppo richiede un mastro')
  })

  it('un gruppo che non appartiene al mastro dichiarato viene rifiutato', () => {
    expect(
      erroreCoerenzaGerarchia({ code: '20.1.01', mastroCode: '21', gruppoCode: '20.1' })
    ).toBe('Il gruppo selezionato non appartiene al mastro selezionato')
  })
})

describe('erroreIncoerenzaConPianoUfficiale', () => {
  it('un codice sconosciuto al piano non è vincolato', () => {
    expect(
      erroreIncoerenzaConPianoUfficiale({ code: '20.1.99', mastroCode: '21', gruppoCode: null })
    ).toBeNull()
  })

  it('un codice noto con mastro e gruppo coerenti col piano non produce errore', () => {
    expect(
      erroreIncoerenzaConPianoUfficiale({ code: '20.1.01', mastroCode: '20', gruppoCode: '20.1' })
    ).toBeNull()
  })

  it('un codice noto con un mastro diverso da quello ufficiale viene rifiutato', () => {
    expect(
      erroreIncoerenzaConPianoUfficiale({ code: '20.1.01', mastroCode: '21', gruppoCode: null })
    ).toContain('mastro 20')
  })

  it('un codice noto con un gruppo diverso da quello ufficiale viene rifiutato', () => {
    expect(
      erroreIncoerenzaConPianoUfficiale({ code: '20.1.01', mastroCode: '20', gruppoCode: '20.3' })
    ).toContain('gruppo 20.1')
  })

  it('un codice noto di un mastro senza gruppi (es. 21.01) è coerente senza gruppo dichiarato', () => {
    expect(
      erroreIncoerenzaConPianoUfficiale({ code: '21.01', mastroCode: '21', gruppoCode: null })
    ).toBeNull()
  })
})
