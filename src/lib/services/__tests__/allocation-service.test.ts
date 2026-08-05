import { describe, it, expect } from 'vitest'
import { ripartisciProQuota } from '../allocation-service'

describe('ripartisciProQuota', () => {
  it('quota piena: le fette restano identiche', () => {
    expect(
      ripartisciProQuota([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }], 1000)
    ).toEqual([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }])
  })

  it('quota parziale: pro-quota al centesimo', () => {
    expect(
      ripartisciProQuota([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }], 500)
    ).toEqual([{ accountId: 'a', importo: 350 }, { accountId: 'b', importo: 150 }])
  })

  it('gli arrotondamenti quadrano sull\'ultima fetta: la somma è sempre la quota', () => {
    const out = ripartisciProQuota(
      [{ accountId: 'a', importo: 33.33 }, { accountId: 'b', importo: 33.33 }, { accountId: 'c', importo: 33.34 }],
      50
    )
    const somma = out.reduce((s, f) => s + f.importo, 0)
    expect(Math.round(somma * 100) / 100).toBe(50)
    out.forEach((f) => expect(f.importo).toBe(Math.round(f.importo * 100) / 100))
  })

  it('fette che si azzerano vengono escluse', () => {
    const out = ripartisciProQuota(
      [{ accountId: 'a', importo: 1000 }, { accountId: 'b', importo: 0.01 }],
      0.5
    )
    expect(out.every((f) => f.importo > 0)).toBe(true)
    expect(Math.round(out.reduce((s, f) => s + f.importo, 0) * 100) / 100).toBe(0.5)
  })
})
