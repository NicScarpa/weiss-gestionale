import { describe, it, expect } from 'vitest'
import { descriviStato, eCollegata, eDaRifare } from '../stati'

describe('stati di una requisition', () => {
  it('traduce i codici che contano', () => {
    expect(descriviStato('LN').nome).toBe('Collegata')
    expect(descriviStato('RJ').nome).toBe('Rifiutata')
    expect(descriviStato('EX').nome).toBe('Scaduta')
    expect(descriviStato('CR').nome).toBe('Creata')
  })

  it('spiega cosa significa, non solo come si chiama', () => {
    expect(descriviStato('LN').spiegazione.length).toBeGreaterThan(20)
    expect(descriviStato('EX').spiegazione).toContain('consenso')
  })

  // Un codice sconosciuto non deve far esplodere una schermata: GoCardless
  // potrebbe aggiungerne uno domani senza avvisare.
  it('non esplode su un codice che non conosce', () => {
    const ignoto = descriviStato('ZZ')
    expect(ignoto.sigla).toBe('ZZ')
    expect(ignoto.nome).toBe('Stato sconosciuto')
  })

  it('riconosce la sola collegata', () => {
    expect(eCollegata('LN')).toBe(true)
    for (const c of ['CR', 'GC', 'UA', 'RJ', 'SA', 'GA', 'EX', 'ZZ']) {
      expect(eCollegata(c)).toBe(false)
    }
  })

  it('riconosce gli stati da cui si riparte solo rifacendo il consenso', () => {
    expect(eDaRifare('RJ')).toBe(true)
    expect(eDaRifare('EX')).toBe(true)
    expect(eDaRifare('LN')).toBe(false)
    expect(eDaRifare('CR')).toBe(false)
  })
})
