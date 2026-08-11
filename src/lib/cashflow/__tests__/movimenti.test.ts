import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import { nettoDiIva, type MovimentoAggregato } from '../movimenti'

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
