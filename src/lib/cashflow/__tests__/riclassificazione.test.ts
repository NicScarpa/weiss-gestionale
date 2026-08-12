import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PIANO_CONTI_WEISS_V4 } from '@/lib/accounts/piano-conti-weiss-v4'
import { logger } from '@/lib/logger'
import {
  CONTI_SISTEMA_FUORI_PROSPETTO,
  CONTI_VERSAMENTO_DI_SISTEMA,
  RICLASSIFICAZIONE_CASH_FLOW,
  VOCI_FUORI_CASSA,
  RIGHE_MEMO,
  risolviContiSistema,
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
  it('comprende mappate, fuori cassa e memo: 169 in tutto', () => {
    const riconosciute = vociRiconosciute()

    // 149 mappate + 18 fuori cassa + 2 di tesoreria nel memo.
    expect(riconosciute.size).toBe(169)
    expect(riconosciute.has('20.1.01')).toBe(true)
    expect(riconosciute.has('31.01')).toBe(true)
    expect(riconosciute.has('40.4.01')).toBe(true)
  })

  it('non comprende i conti di sistema: sono dichiarati per chiave, non per codice', () => {
    // I conti di sistema non hanno un codice fisso qui dentro: C4 li
    // riconosce consultando anche `risolviContiSistema`, non solo
    // `vociRiconosciute()`. Se questa funzione tornasse a includerli per
    // codice, ricadrebbe nello stesso problema che l'ha fatta cambiare.
    const riconosciute = vociRiconosciute()
    expect(riconosciute.has('100')).toBe(false)
    expect(riconosciute.has('110')).toBe(false)
  })

  it('non riconosce un codice inventato: è così che il controllo C4 se ne accorge', () => {
    expect(vociRiconosciute().has('999.99')).toBe(false)
  })
})

describe('CONTI_SISTEMA_FUORI_PROSPETTO e CONTI_VERSAMENTO_DI_SISTEMA', () => {
  it('dichiarano sei conti di sistema, ognuno con un motivo', () => {
    expect(CONTI_SISTEMA_FUORI_PROSPETTO.size).toBe(6)
    for (const [chiave, motivo] of CONTI_SISTEMA_FUORI_PROSPETTO) {
      expect(motivo.length, `${chiave} è senza motivo`).toBeGreaterThan(10)
    }
  })

  it('le chiavi del versamento serale sono un sottoinsieme dei conti fuori prospetto', () => {
    for (const chiave of CONTI_VERSAMENTO_DI_SISTEMA) {
      expect(CONTI_SISTEMA_FUORI_PROSPETTO.has(chiave), chiave).toBe(true)
    }
  })
})

describe('risolviContiSistema', () => {
  afterEach(() => vi.restoreAllMocks())

  it('traduce le chiavi nei codici correnti, qualunque essi siano', () => {
    // I codici qui sotto non sono '100'/'110': è proprio il punto — la
    // risoluzione passa dalla system_key, non da una stringa fissata nel
    // codice, quindi funziona anche se in questo database i codici sono
    // altri.
    const mappa = new Map([
      ['CASSA', '999-cassa'],
      ['BANCA', '998-banca'],
      ['DEBITI_FORNITORI', '997-debiti'],
      ['POS_WORLDLINE', '996-worldline'],
      ['POS_AXERVE', '995-axerve'],
      ['POS_SUMUP', '994-sumup'],
    ])

    const { fuoriProspetto, versamento } = risolviContiSistema(mappa)

    expect(fuoriProspetto.has('999-cassa')).toBe(true)
    expect(fuoriProspetto.has('998-banca')).toBe(true)
    expect(fuoriProspetto.has('997-debiti')).toBe(true)
    expect(versamento).toEqual(['999-cassa', '998-banca'])
  })

  it('una chiave non risolta non entra nei due insiemi, ma lo segnala nei log invece di sparire in silenzio', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    const { fuoriProspetto, versamento } = risolviContiSistema(new Map())

    expect(fuoriProspetto.size).toBe(0)
    expect(versamento).toEqual([])
    // Sei chiavi dichiarate, nessuna risolta: sei avvisi, non un'eccezione.
    expect(warn).toHaveBeenCalledTimes(6)
    expect(warn.mock.calls.some(([messaggio]) => messaggio.includes('CASSA'))).toBe(true)
  })

  it('non lancia quando manca una sola chiave: in un database appena creato è normale', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const mappa = new Map([
      ['CASSA', '100'],
      ['BANCA', '110'],
      ['DEBITI_FORNITORI', '200'],
      // I tre transitori POS mancano: non ancora configurati.
    ])

    expect(() => risolviContiSistema(mappa)).not.toThrow()
    const { fuoriProspetto, versamento } = risolviContiSistema(mappa)

    expect(fuoriProspetto).toEqual(new Set(['100', '110', '200']))
    expect(versamento).toEqual(['100', '110'])
    expect(warn).toHaveBeenCalled()
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
