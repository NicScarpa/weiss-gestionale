import { describe, it, expect } from 'vitest'
import { PIANO_CONTI_WEISS_V4, CENTRI_DI_COSTO } from '../piano-conti-weiss-v4'

const CODE_PATTERN = /^\d{2}\.(\d\.)?\d{2}$/

describe('PIANO_CONTI_WEISS_V4', () => {
  it('contiene esattamente 169 voci', () => {
    expect(PIANO_CONTI_WEISS_V4).toHaveLength(169)
  })

  it('ha 12 voci RICAVO, 143 COSTO e 14 PATRIMONIALE', () => {
    const ricavi = PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'RICAVO')
    const costi = PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'COSTO')
    const patrimoniali = PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'PATRIMONIALE')

    expect(ricavi).toHaveLength(12)
    expect(costi).toHaveLength(143)
    expect(patrimoniali).toHaveLength(14)
  })

  it('ha codici tutti univoci', () => {
    const codes = PIANO_CONTI_WEISS_V4.map((v) => v.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('ogni code rispetta il formato a due o tre livelli', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      expect(voce.code).toMatch(CODE_PATTERN)
    }
  })

  it('gruppoCode è presente solo per i mastri 20, 28, 32 e 40', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      const articolato = ['20', '28', '32', '40'].includes(voce.mastroCode)
      expect(Boolean(voce.gruppoCode)).toBe(articolato)
    }
  })

  it('gruppoNome è presente se e solo se gruppoCode è presente', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      if (voce.gruppoCode) {
        expect(voce.gruppoNome).toBeDefined()
      } else {
        expect(voce.gruppoNome).toBeUndefined()
      }
    }
  })

  it('gruppoCode è coerente con mastroCode e code è coerente con gruppoCode/mastroCode', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      if (voce.gruppoCode) {
        expect(voce.gruppoCode.startsWith(voce.mastroCode + '.')).toBe(true)
      }
      const prefisso = voce.gruppoCode ?? voce.mastroCode
      expect(voce.code.startsWith(prefisso + '.')).toBe(true)
    }
  })

  it('i mastri RICAVO stanno tra 10 e 13, i COSTO tra 20 e 33, i PATRIMONIALE valgono 40', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      const mastro = Number(voce.mastroCode)

      if (voce.tipo === 'RICAVO') expect(mastro).toBeGreaterThanOrEqual(10)
      if (voce.tipo === 'RICAVO') expect(mastro).toBeLessThanOrEqual(13)
      if (voce.tipo === 'COSTO') expect(mastro).toBeGreaterThanOrEqual(20)
      if (voce.tipo === 'COSTO') expect(mastro).toBeLessThanOrEqual(33)
      if (voce.tipo === 'PATRIMONIALE') expect(mastro).toBe(40)
    }
  })

  it('le voci patrimoniali coprono i quattro gruppi del mastro 40', () => {
    const gruppi = new Set(
      PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'PATRIMONIALE').map((v) => v.gruppoCode),
    )

    expect([...gruppi].sort()).toEqual(['40.1', '40.2', '40.3', '40.4'])
  })

  it("l'array è già ordinato per code (ordinamento lessicografico)", () => {
    const codes = PIANO_CONTI_WEISS_V4.map((v) => v.code)
    const sorted = [...codes].sort((a, b) => a.localeCompare(b))
    expect(codes).toEqual(sorted)
  })

  it('ogni voce ha una regolaCentro valorizzata', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      expect(voce.regolaCentro === 'OBBLIGATORIO' || voce.regolaCentro === 'DEFAULT_STR').toBe(
        true,
      )
    }
  })

  it('verifiche puntuali a campione', () => {
    const byCode = (code: string) => PIANO_CONTI_WEISS_V4.find((v) => v.code === code)

    expect(byCode('20.1.01')).toMatchObject({
      nome: 'Birra fusto',
      regolaCentro: 'OBBLIGATORIO',
      gruppoCode: '20.1',
    })

    expect(byCode('28.1.09')).toMatchObject({
      nome: 'Retribuzioni personale amministrativo',
      regolaCentro: 'DEFAULT_STR',
    })

    const voce3014 = byCode('30.14')
    expect(voce3014).toMatchObject({
      nome: "SIAE e SCF musica d'ambiente",
      regolaCentro: 'OBBLIGATORIO',
    })
    expect(voce3014?.gruppoCode).toBeUndefined()

    expect(byCode('10.01')).toMatchObject({
      nome: 'Corrispettivi',
      regolaCentro: 'OBBLIGATORIO',
    })
  })
})

describe('CENTRI_DI_COSTO', () => {
  it('contiene esattamente 4 centri', () => {
    expect(CENTRI_DI_COSTO).toHaveLength(4)
  })

  it('ha code tutti univoci', () => {
    const codes = CENTRI_DI_COSTO.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('ha esattamente un centro isDefault, ed è STR', () => {
    const defaults = CENTRI_DI_COSTO.filter((c) => c.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].code).toBe('STR')
  })
})
