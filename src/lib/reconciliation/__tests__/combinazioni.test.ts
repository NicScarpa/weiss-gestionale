import { describe, it, expect } from 'vitest'
import { trovaCombinazioni, MAX_GAMBE } from '../combinazioni'
import type { ScadenzaCandidata } from '../punteggio'

function scadenza(id: string, residuo: number, supplierId = 'sup-1'): ScadenzaCandidata {
  return {
    id,
    tipo: 'passiva',
    dataScadenza: new Date('2026-07-07'),
    descrizione: `Scadenza ${id}`,
    residuo,
    numeroDocumento: null,
    controparteNome: 'FORNITORE UNO',
    controparteIban: null,
    supplierId,
    partitaIvaControparte: null,
    metodoPagamento: null,
  }
}

describe('trovaCombinazioni', () => {
  it('trova le tre fatture che un bonifico unico salda', () => {
    const combinazioni = trovaCombinazioni(3240, [
      scadenza('a', 1080),
      scadenza('b', 1080),
      scadenza('c', 1080),
      scadenza('d', 500),
    ])
    expect(combinazioni).toHaveLength(1)
    expect(combinazioni[0].map((s) => s.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('non restituisce le combinazioni di una gamba sola', () => {
    // Quelle sono già coperte dalla valutazione coppia per coppia
    const combinazioni = trovaCombinazioni(1000, [scadenza('a', 1000)])
    expect(combinazioni).toHaveLength(0)
  })

  it('tollera un centesimo di differenza, non di più', () => {
    expect(trovaCombinazioni(1000.01, [scadenza('a', 500), scadenza('b', 500)])).toHaveLength(1)
    expect(trovaCombinazioni(1000.5, [scadenza('a', 500), scadenza('b', 500)])).toHaveLength(0)
  })

  it('non mescola controparti diverse', () => {
    const combinazioni = trovaCombinazioni(1000, [
      scadenza('a', 500, 'sup-1'),
      scadenza('b', 500, 'sup-2'),
    ])
    expect(combinazioni).toHaveLength(0)
  })

  it('non supera il numero massimo di gambe', () => {
    // cinque da 200 farebbero 1000, ma sono più di MAX_GAMBE
    const cinque = [1, 2, 3, 4, 5].map((n) => scadenza(`s${n}`, 200))
    expect(MAX_GAMBE).toBe(4)
    expect(trovaCombinazioni(1000, cinque)).toHaveLength(0)
  })

  it('non esplode su molte candidate', () => {
    const molte = Array.from({ length: 60 }, (_, i) => scadenza(`s${i}`, 100 + i))
    const inizio = Date.now()
    trovaCombinazioni(1_000_000, molte) // importo irraggiungibile: esplora tutto
    expect(Date.now() - inizio).toBeLessThan(2000)
  })

  it('su nessuna candidata torna una lista vuota', () => {
    expect(trovaCombinazioni(1000, [])).toEqual([])
  })

  it('non combina scadenze senza controparte identificabile, anche se la somma torna', () => {
    // Senza supplierId e senza controparteNome non c'è prova che siano
    // collegate: l'unica cosa che le unirebbe sarebbe l'aritmetica.
    const senzaControparte = (id: string, residuo: number): ScadenzaCandidata => ({
      ...scadenza(id, residuo),
      supplierId: null,
      controparteNome: null,
    })
    const combinazioni = trovaCombinazioni(1000, [
      senzaControparte('a', 500),
      senzaControparte('b', 500),
    ])
    expect(combinazioni).toHaveLength(0)
  })
})
