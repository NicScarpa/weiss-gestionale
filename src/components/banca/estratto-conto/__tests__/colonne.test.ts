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

  // La memoria della consegna A elencava le VISIBILI: si legge una volta e si
  // capisce cosa era nascosto fra le colonne di allora. Una colonna nuova
  // (Categoria) nasce visibile anche per chi aveva già salvato.
  it('legge la memoria della consegna A e mostra comunque la colonna nuova', () => {
    expect([...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '["data","fantasma"]' }))]).toEqual(['data', 'categoria'])
    expect([...leggiColonneVisibili(memoria({ 'weiss.estrattoConto.colonne': '{rotto' }))]).toEqual(COLONNE.map((c) => c.id))
  })

  it('rispetta l\'ordine delle colonne, non quello salvato', () => {
    const m = memoria()
    salvaColonneVisibili(m, new Set(['importo', 'data']))
    expect([...leggiColonneVisibili(m)]).toEqual(['data', 'importo'])
  })

  it('salva le NASCOSTE, così una colonna futura nasce visibile', () => {
    const m = memoria()
    salvaColonneVisibili(m, new Set(['data', 'descrizione', 'conto', 'categoria', 'stato', 'importo']))
    expect(m.dati['weiss.estrattoConto.colonneNascoste']).toBe('["causale"]')
    expect(m.dati['weiss.estrattoConto.colonne']).toBeUndefined()
  })

  it('la memoria nuova vince su quella vecchia', () => {
    const m = memoria({ 'weiss.estrattoConto.colonne': '["data"]', 'weiss.estrattoConto.colonneNascoste': '["importo"]' })
    expect([...leggiColonneVisibili(m)]).toEqual(['data', 'descrizione', 'causale', 'conto', 'categoria', 'stato'])
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
