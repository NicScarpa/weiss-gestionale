import { describe, it, expect } from 'vitest'
import {
  leggiColonneVisibili,
  salvaColonneVisibili,
  leggiRighePerPagina,
  salvaRighePerPagina,
  COLONNE,
} from '../colonne'

function memoria(iniziale: Record<string, string> = {}) {
  const dati = { ...iniziale }
  return {
    getItem: (k: string) => dati[k] ?? null,
    setItem: (k: string, v: string) => {
      dati[k] = v
    },
    dati,
  }
}

describe('colonne visibili', () => {
  it('senza memoria sono tutte visibili', () => {
    expect([...leggiColonneVisibili(null)]).toEqual(COLONNE.map((c) => c.id))
  })

  it('la scelta si salva e si rilegge', () => {
    const m = memoria()
    salvaColonneVisibili(m, new Set(['data', 'importo']))
    expect([...leggiColonneVisibili(m)]).toEqual(['data', 'importo'])
  })

  // Una colonna che non esiste più (o un JSON rotto) non deve rompere la lista.
  it('ignora identificativi sconosciuti e memoria corrotta', () => {
    expect([
      ...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '["data","fantasma"]' })),
    ]).toEqual(['data'])
    expect([...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '{rotto' }))]).toEqual(
      COLONNE.map((c) => c.id)
    )
  })

  // L'ordine è del modulo, non della memoria: una colonna riattivata torna
  // al suo posto invece di finire in fondo.
  it('rispetta l\'ordine delle colonne, non quello salvato', () => {
    const m = memoria({ 'weiss.estrattoConto.colonne': '["importo","data"]' })
    expect([...leggiColonneVisibili(m)]).toEqual(['data', 'importo'])
  })
})

describe('righe per pagina', () => {
  it('parte a 100 e ricorda la scelta fra 20, 50 e 100', () => {
    const m = memoria()
    expect(leggiRighePerPagina(m)).toBe(100)
    salvaRighePerPagina(m, 50)
    expect(leggiRighePerPagina(m)).toBe(50)
    expect(leggiRighePerPagina(memoria({ 'weiss.estrattoConto.righePerPagina': '7' }))).toBe(100)
  })
})
