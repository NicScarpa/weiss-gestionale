import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import { nettoDiIva, ripartisciIva, type MovimentoAggregato } from '../movimenti'

function movimento(parziale: Partial<MovimentoAggregato>): MovimentoAggregato {
  return {
    accountId: 'conto',
    mese: 1,
    dare: money(0),
    avere: money(0),
    ivaDare: money(0),
    ivaAvere: money(0),
    ...parziale,
  }
}

describe('nettoDiIva', () => {
  it("un'uscita di 122 con 22 di IVA vale −100", () => {
    const netto = nettoDiIva(movimento({ avere: money(122), ivaAvere: money(22) }))
    expect(netto.toNumber()).toBe(-100)
  })

  it("un'entrata di 122 con 22 di IVA vale +100", () => {
    const netto = nettoDiIva(movimento({ dare: money(122), ivaDare: money(22) }))
    expect(netto.toNumber()).toBe(100)
  })

  it('senza IVA il netto coincide con dare meno avere', () => {
    const netto = nettoDiIva(movimento({ dare: money(500), avere: money(120) }))
    expect(netto.toNumber()).toBe(380)
  })

  it('entrate e uscite sullo stesso conto e mese si compensano al netto', () => {
    const netto = nettoDiIva(
      movimento({
        dare: money(61),
        ivaDare: money(11),
        avere: money(122),
        ivaAvere: money(22),
      })
    )
    expect(netto.toNumber()).toBe(-50)
  })

  it('non perde centesimi su importi con decimali', () => {
    const netto = nettoDiIva(movimento({ avere: money('12.20'), ivaAvere: money('2.20') }))
    expect(netto.toFixed(2)).toBe('-10.00')
  })
})

describe('ripartisciIva', () => {
  it("con solo il dare valorizzato manda l'IVA in ivaDare", () => {
    const { ivaDare, ivaAvere } = ripartisciIva(money(61), money(0), money(11))
    expect(ivaDare.toNumber()).toBe(11)
    expect(ivaAvere.toNumber()).toBe(0)
  })

  it("con solo l'avere valorizzato manda l'IVA in ivaAvere", () => {
    const { ivaDare, ivaAvere } = ripartisciIva(money(0), money(122), money(22))
    expect(ivaDare.toNumber()).toBe(0)
    expect(ivaAvere.toNumber()).toBe(22)
  })

  it("con entrambe le colonne a zero e IVA diversa da zero manda l'IVA in ivaAvere", () => {
    // Caso che non si presenta in prima nota (un movimento senza dare né
    // avere non ha ragione di esistere): comportamento documentato qui
    // com'è, non una regola contabile. La condizione guarda solo `dare`.
    const { ivaDare, ivaAvere } = ripartisciIva(money(0), money(0), money(5))
    expect(ivaDare.toNumber()).toBe(0)
    expect(ivaAvere.toNumber()).toBe(5)
  })

  it("con entrambe le colonne valorizzate manda l'IVA in ivaDare", () => {
    // Anche questo caso è estraneo a questa prima nota. La scelta di
    // mandare l'IVA in dare è arbitraria: nessun controllo di quadratura la
    // verifica, perché dare − avere non cambia qualunque verso la riceva.
    const { ivaDare, ivaAvere } = ripartisciIva(money(100), money(50), money(22))
    expect(ivaDare.toNumber()).toBe(22)
    expect(ivaAvere.toNumber()).toBe(0)
  })
})
