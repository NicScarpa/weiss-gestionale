import { describe, it, expect } from 'vitest'
import { righeDiSistema, LINEA_BOLLO, LINEA_ARROTONDAMENTO } from '../righe-di-sistema'

describe('righeDiSistema', () => {
  it('produce la riga del bollo quando la fattura lo riporta', () => {
    const righe = righeDiSistema({ datiBollo: { importoBollo: 2 } } as never)
    expect(righe).toEqual([
      { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, aliquota: 0 },
    ])
  })

  it('produce la riga dell\'arrotondamento, anche negativo', () => {
    const righe = righeDiSistema({ arrotondamento: -0.02 } as never)
    expect(righe).toEqual([
      { numeroLinea: LINEA_ARROTONDAMENTO, descrizione: 'Arrotondamento', importo: -0.02, aliquota: 0 },
    ])
  })

  it('non produce righe a zero: una riga da imputare che vale zero è rumore', () => {
    expect(righeDiSistema({ datiBollo: { importoBollo: 0 }, arrotondamento: 0 } as never)).toEqual([])
  })

  it('non produce nulla su una fattura senza bollo né arrotondamento', () => {
    expect(righeDiSistema({} as never)).toEqual([])
  })
})
