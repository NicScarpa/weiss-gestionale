import { describe, it, expect } from 'vitest'
import { buildAccountTree, type AccountHierarchyFields } from '../build-account-tree'
import { PIANO_CONTI_WEISS_V4 } from '../piano-conti-weiss-v4'

interface VoceTest extends AccountHierarchyFields {
  code: string
}

function voce(overrides: Partial<VoceTest> & { code: string }): VoceTest {
  return {
    mastroCode: null,
    mastroNome: null,
    gruppoCode: null,
    gruppoNome: null,
    ...overrides,
  }
}

// Le 155 voci reali del piano, nella forma con gerarchia normalizzata a null
// (undefined → null) come arriva da Prisma, invece che optional come nella
// sorgente TypeScript del piano.
const VOCI_PIANO_V4: VoceTest[] = PIANO_CONTI_WEISS_V4.map((v) => ({
  code: v.code,
  mastroCode: v.mastroCode,
  mastroNome: v.mastroNome,
  gruppoCode: v.gruppoCode ?? null,
  gruppoNome: v.gruppoNome ?? null,
}))

describe('buildAccountTree', () => {
  it('con lista vuota restituisce un array vuoto', () => {
    expect(buildAccountTree([])).toEqual([])
  })

  it('raggruppa una voce per mastro e gruppo, portando su i nomi denormalizzati', () => {
    const albero = buildAccountTree([
      voce({ code: '20.1.01', mastroCode: '20', mastroNome: 'Materie prime', gruppoCode: '20.1', gruppoNome: 'Beverage alcolico' }),
    ])

    expect(albero).toEqual([
      {
        mastroCode: '20',
        mastroNome: 'Materie prime',
        gruppi: [
          {
            gruppoCode: '20.1',
            gruppoNome: 'Beverage alcolico',
            voci: [voce({ code: '20.1.01', mastroCode: '20', mastroNome: 'Materie prime', gruppoCode: '20.1', gruppoNome: 'Beverage alcolico' })],
          },
        ],
      },
    ])
  })

  it('due voci dello stesso mastro senza gruppo finiscono in un unico gruppo sintetico (gruppoCode/gruppoNome null)', () => {
    const albero = buildAccountTree([
      voce({ code: '21.01', mastroCode: '21', mastroNome: 'Attrezzatura' }),
      voce({ code: '21.02', mastroCode: '21', mastroNome: 'Attrezzatura' }),
    ])

    expect(albero).toHaveLength(1)
    expect(albero[0].gruppi).toEqual([
      {
        gruppoCode: null,
        gruppoNome: null,
        voci: [
          voce({ code: '21.01', mastroCode: '21', mastroNome: 'Attrezzatura' }),
          voce({ code: '21.02', mastroCode: '21', mastroNome: 'Attrezzatura' }),
        ],
      },
    ])
  })

  it('una voce senza mastro (patrimoniale o legacy) finisce in un mastro sintetico invece di sparire', () => {
    const patrimoniale = voce({ code: '100', mastroCode: null, mastroNome: null })
    const albero = buildAccountTree([patrimoniale])

    expect(albero).toEqual([
      { mastroCode: null, mastroNome: null, gruppi: [{ gruppoCode: null, gruppoNome: null, voci: [patrimoniale] }] },
    ])
  })

  it('il mastro sintetico (senza mastroCode) va sempre in fondo, anche se compare per primo nell\'input', () => {
    const patrimoniale = voce({ code: '100', mastroCode: null, mastroNome: null })
    const economico = voce({ code: '10.01', mastroCode: '10', mastroNome: 'Ricavi delle vendite' })

    const albero = buildAccountTree([patrimoniale, economico])

    expect(albero.map((m) => m.mastroCode)).toEqual(['10', null])
  })

  it('il gruppo sintetico (senza gruppoCode) va in fondo rispetto ai gruppi reali dello stesso mastro', () => {
    // Caso difensivo: nei dati reali un mastro è o interamente articolato in
    // gruppi o per niente (mai misto), ma il builder non deve assumerlo.
    const senzaGruppo = voce({ code: '20.99', mastroCode: '20', mastroNome: 'Materie prime' })
    const conGruppo = voce({ code: '20.1.01', mastroCode: '20', mastroNome: 'Materie prime', gruppoCode: '20.1', gruppoNome: 'Beverage alcolico' })

    const albero = buildAccountTree([senzaGruppo, conGruppo])

    expect(albero[0].gruppi.map((g) => g.gruppoCode)).toEqual(['20.1', null])
  })

  it('preserva l\'ordine di prima comparsa dei mastri e dei gruppi reali', () => {
    const albero = buildAccountTree([
      voce({ code: '28.1.01', mastroCode: '28', mastroNome: 'Personale', gruppoCode: '28.1', gruppoNome: 'Retribuzioni' }),
      voce({ code: '20.1.01', mastroCode: '20', mastroNome: 'Materie prime', gruppoCode: '20.1', gruppoNome: 'Beverage alcolico' }),
      voce({ code: '20.2.01', mastroCode: '20', mastroNome: 'Materie prime', gruppoCode: '20.2', gruppoNome: 'Beverage analcolico' }),
    ])

    expect(albero.map((m) => m.mastroCode)).toEqual(['28', '20'])
    expect(albero[1].gruppi.map((g) => g.gruppoCode)).toEqual(['20.1', '20.2'])
  })

  it('è generico: funziona con righe che portano campi propri (es. importi del report) e li preserva integralmente', () => {
    interface RigaConImporto extends AccountHierarchyFields {
      code: string
      total: number
    }
    const riga: RigaConImporto = {
      code: '20.1.01',
      mastroCode: '20',
      mastroNome: 'Materie prime',
      gruppoCode: '20.1',
      gruppoNome: 'Beverage alcolico',
      total: 1234.56,
    }

    const albero = buildAccountTree([riga])

    expect(albero[0].gruppi[0].voci[0]).toEqual(riga)
    expect(albero[0].gruppi[0].voci[0].total).toBe(1234.56)
  })

  describe('sulle 155 voci reali del piano WEISS v4', () => {
    it('non perde nessuna voce', () => {
      const albero = buildAccountTree(VOCI_PIANO_V4)
      const totaleVoci = albero.reduce(
        (somma, mastro) => somma + mastro.gruppi.reduce((s, g) => s + g.voci.length, 0),
        0
      )
      expect(totaleVoci).toBe(155)
    })

    it('produce i 17 mastri attesi (10-13 ricavi, 20-33 costi), tutti con mastroCode reale', () => {
      const albero = buildAccountTree(VOCI_PIANO_V4)
      const mastriAttesi = ['10', '11', '12', '13', ...Array.from({ length: 14 }, (_, i) => String(20 + i))]
      expect(albero.map((m) => m.mastroCode)).toEqual(mastriAttesi)
    })

    it('solo i mastri 20, 28 e 32 hanno gruppi reali; gli altri hanno un unico gruppo sintetico', () => {
      const albero = buildAccountTree(VOCI_PIANO_V4)
      const mastriConGruppo = new Set(['20', '28', '32'])

      for (const mastro of albero) {
        if (mastriConGruppo.has(mastro.mastroCode!)) {
          expect(mastro.gruppi.every((g) => g.gruppoCode !== null)).toBe(true)
          expect(mastro.gruppi.length).toBeGreaterThan(1)
        } else {
          expect(mastro.gruppi).toEqual([{ gruppoCode: null, gruppoNome: null, voci: mastro.gruppi[0].voci }])
        }
      }
    })

    it('nessun mastro sintetico: tutte le voci del piano hanno un mastroCode', () => {
      const albero = buildAccountTree(VOCI_PIANO_V4)
      expect(albero.some((m) => m.mastroCode === null)).toBe(false)
    })
  })
})
