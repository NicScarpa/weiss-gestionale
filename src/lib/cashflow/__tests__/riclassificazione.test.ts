import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PIANO_CONTI_WEISS_V4 } from '@/lib/accounts/piano-conti-weiss-v4'
import {
  RICLASSIFICAZIONE_CASH_FLOW,
  VOCI_FUORI_CASSA,
  RIGHE_MEMO,
  vociRiconosciute,
} from '../riclassificazione'

const vociMappate = RICLASSIFICAZIONE_CASH_FLOW.flatMap((f) =>
  f.sottogruppi.flatMap((s) => s.voci)
)

describe('struttura', () => {
  it('ha 9 famiglie e 39 sottogruppi', () => {
    expect(RICLASSIFICAZIONE_CASH_FLOW).toHaveLength(9)
    expect(RICLASSIFICAZIONE_CASH_FLOW.flatMap((f) => f.sottogruppi)).toHaveLength(39)
  })

  it('mappa 149 voci nel prospetto, senza duplicati', () => {
    expect(vociMappate).toHaveLength(149)
    expect(new Set(vociMappate).size).toBe(149)
  })

  it('dichiara 18 voci fuori cassa, ognuna con un motivo', () => {
    expect(VOCI_FUORI_CASSA.size).toBe(18)
    for (const motivo of VOCI_FUORI_CASSA.values()) {
      expect(motivo.length).toBeGreaterThan(10)
    }
  })

  it('i codici di famiglia sono A..I e i sottogruppi iniziano con la loro famiglia', () => {
    expect(RICLASSIFICAZIONE_CASH_FLOW.map((f) => f.codice)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
    ])

    for (const famiglia of RICLASSIFICAZIONE_CASH_FLOW) {
      for (const sottogruppo of famiglia.sottogruppi) {
        expect(sottogruppo.codice.startsWith(famiglia.codice)).toBe(true)
      }
    }
  })
})

describe('copertura del piano dei conti', () => {
  it('ogni voce del piano è mappata oppure dichiarata fuori cassa, mai entrambe', () => {
    const mappate = new Set(vociMappate)

    for (const voce of PIANO_CONTI_WEISS_V4) {
      const inProspetto = mappate.has(voce.code)
      const fuoriCassa = VOCI_FUORI_CASSA.has(voce.code)
      const inMemo = RIGHE_MEMO.some((m) => m.voci?.includes(voce.code))

      expect(
        [inProspetto, fuoriCassa, inMemo].filter(Boolean).length,
        `${voce.code} ${voce.nome}`
      ).toBe(1)
    }
  })

  it('non mappa codici che nel piano non esistono', () => {
    const esistenti = new Set(PIANO_CONTI_WEISS_V4.map((v) => v.code))

    for (const code of vociMappate) {
      expect(esistenti.has(code), `${code} non è nel piano dei conti`).toBe(true)
    }
    for (const code of VOCI_FUORI_CASSA.keys()) {
      expect(esistenti.has(code), `${code} non è nel piano dei conti`).toBe(true)
    }
  })

  it('le due voci di tesoreria interna stanno nel memo, non fra le fuori cassa', () => {
    const mappate = new Set(vociMappate)

    expect(mappate.has('40.4.01')).toBe(false)
    expect(VOCI_FUORI_CASSA.has('40.4.01')).toBe(false)
    expect(RIGHE_MEMO.find((m) => m.codice === 'M3')!.voci).toContain('40.4.01')
  })
})

describe('vociRiconosciute', () => {
  it('comprende le mappate, le fuori cassa e quelle del memo: 169 in tutto', () => {
    const riconosciute = vociRiconosciute()

    expect(riconosciute.size).toBe(169)
    expect(riconosciute.has('20.1.01')).toBe(true)
    expect(riconosciute.has('31.01')).toBe(true)
    expect(riconosciute.has('40.4.01')).toBe(true)
  })

  it('non riconosce un codice inventato: è così che il controllo C4 se ne accorge', () => {
    expect(vociRiconosciute().has('999.99')).toBe(false)
  })
})

describe('coerenza col documento consegnato al committente', () => {
  it('rispecchia docs/cash-flow-riclassificazione.json', () => {
    const documento = JSON.parse(
      readFileSync(join(process.cwd(), 'docs/cash-flow-riclassificazione.json'), 'utf8')
    ) as {
      famiglie: { codice: string; sottogruppi: { codice: string; voci: string[] }[] }[]
    }

    const daJson = documento.famiglie.map((f) => ({
      codice: f.codice,
      sottogruppi: f.sottogruppi.map((s) => ({ codice: s.codice, voci: s.voci })),
    }))
    const daCodice = RICLASSIFICAZIONE_CASH_FLOW.map((f) => ({
      codice: f.codice,
      sottogruppi: f.sottogruppi.map((s) => ({ codice: s.codice, voci: [...s.voci] })),
    }))

    expect(daCodice).toEqual(daJson)
  })
})
