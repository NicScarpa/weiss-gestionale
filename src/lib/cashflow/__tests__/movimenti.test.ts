import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import {
  aggregaMovimenti,
  nettoDiIva,
  ripartisciIva,
  type MovimentoAggregato,
  type MovimentoPrimaNota,
} from '../movimenti'

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

function riga(parziale: Partial<MovimentoPrimaNota>): MovimentoPrimaNota {
  return {
    accountId: 'testata',
    // `date` è `@db.Date`: mezzanotte UTC, come arriva da Prisma.
    date: new Date(Date.UTC(2026, 0, 15)),
    debitAmount: null,
    creditAmount: null,
    vatAmount: null,
    allocations: [],
    ...parziale,
  }
}

function suConto(aggregati: MovimentoAggregato[], accountId: string): MovimentoAggregato {
  const trovato = aggregati.find((m) => m.accountId === accountId)
  if (!trovato) throw new Error(`nessun aggregato sul conto ${accountId}`)
  return trovato
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

describe('aggregaMovimenti', () => {
  it('somma per conto e mese le righe senza fette', () => {
    const aggregati = aggregaMovimenti([
      riga({ creditAmount: 100 }),
      riga({ creditAmount: 50 }),
      riga({ creditAmount: 30, date: new Date(Date.UTC(2026, 6, 1)) }),
    ])

    expect(aggregati).toHaveLength(2)
    expect(aggregati.find((m) => m.mese === 1)!.avere.toNumber()).toBe(150)
    expect(aggregati.find((m) => m.mese === 7)!.avere.toNumber()).toBe(30)
  })

  it('una suddivisione su due conti porta gli importi sulle fette e svuota la testata', () => {
    // È il caso del commento in saldi.ts: 1.000 € divisi 700 e 300. Prima di
    // questo cambiamento il prospetto mostrava 1.000 sulla famiglia del conto
    // di testata e zero sull'altra.
    const aggregati = aggregaMovimenti([
      riga({
        creditAmount: 1000,
        allocations: [
          { accountId: 'alimentari', importo: 700, iva: null },
          { accountId: 'pulizie', importo: 300, iva: null },
        ],
      }),
    ])

    expect(nettoDiIva(suConto(aggregati, 'alimentari')).toNumber()).toBe(-700)
    expect(nettoDiIva(suConto(aggregati, 'pulizie')).toNumber()).toBe(-300)
    expect(nettoDiIva(suConto(aggregati, 'testata')).toNumber()).toBe(0)
  })

  it('le fette restano nel mese della riga che le contiene', () => {
    const aggregati = aggregaMovimenti([
      riga({
        date: new Date(Date.UTC(2026, 6, 1)),
        creditAmount: 1000,
        allocations: [{ accountId: 'alimentari', importo: 1000, iva: null }],
      }),
    ])

    expect(suConto(aggregati, 'alimentari').mese).toBe(7)
  })

  it('una suddivisione parziale lascia il resto sulla testata', () => {
    const aggregati = aggregaMovimenti([
      riga({
        creditAmount: 1000,
        allocations: [{ accountId: 'alimentari', importo: 700, iva: null }],
      }),
    ])

    expect(nettoDiIva(suConto(aggregati, 'alimentari')).toNumber()).toBe(-700)
    expect(nettoDiIva(suConto(aggregati, 'testata')).toNumber()).toBe(-300)
  })

  it("l'IVA di una riga suddivisa segue le fette pro-quota sul lordo", () => {
    // 1.220 lordi con 220 di IVA, divisi 854 (70%) e 366 (30%): a ciascuna
    // fetta la sua quota di IVA, e sulla testata non resta né importo né IVA.
    const aggregati = aggregaMovimenti([
      riga({
        creditAmount: 1220,
        vatAmount: 220,
        allocations: [
          { accountId: 'alimentari', importo: 854, iva: null },
          { accountId: 'pulizie', importo: 366, iva: null },
        ],
      }),
    ])

    expect(suConto(aggregati, 'alimentari').ivaAvere.toNumber()).toBe(154)
    expect(suConto(aggregati, 'pulizie').ivaAvere.toNumber()).toBe(66)
    expect(suConto(aggregati, 'testata').ivaAvere.toNumber()).toBe(0)

    expect(nettoDiIva(suConto(aggregati, 'alimentari')).toNumber()).toBe(-700)
    expect(nettoDiIva(suConto(aggregati, 'pulizie')).toNumber()).toBe(-300)
    expect(nettoDiIva(suConto(aggregati, 'testata')).toNumber()).toBe(0)
  })

  it("su una suddivisione parziale con IVA la testata tiene la quota di IVA che le resta", () => {
    const aggregati = aggregaMovimenti([
      riga({
        creditAmount: 1220,
        vatAmount: 220,
        allocations: [{ accountId: 'alimentari', importo: 610, iva: null }],
      }),
    ])

    expect(suConto(aggregati, 'alimentari').ivaAvere.toNumber()).toBe(110)
    expect(suConto(aggregati, 'testata').ivaAvere.toNumber()).toBe(110)
  })

  it("un'entrata suddivisa manda le fette in dare, non in avere", () => {
    const aggregati = aggregaMovimenti([
      riga({
        debitAmount: 1000,
        allocations: [{ accountId: 'eventi', importo: 400, iva: null }],
      }),
    ])

    expect(suConto(aggregati, 'eventi').dare.toNumber()).toBe(400)
    expect(suConto(aggregati, 'eventi').avere.toNumber()).toBe(0)
    expect(nettoDiIva(suConto(aggregati, 'eventi')).toNumber()).toBe(400)
  })

  it("l'IVA totale si conserva anche quando la ripartizione non è esatta", () => {
    // Tre fette da un terzo: il pro-quota non dà centesimi tondi, ma la quota
    // tolta alla testata è per costruzione la somma di quelle date alle fette.
    const aggregati = aggregaMovimenti([
      riga({
        creditAmount: 1000,
        vatAmount: 220,
        allocations: [
          { accountId: 'a', importo: '333.33', iva: null },
          { accountId: 'b', importo: '333.33', iva: null },
          { accountId: 'c', importo: '333.34', iva: null },
        ],
      }),
    ])

    const ivaTotale = aggregati.reduce((tot, m) => tot.plus(m.ivaAvere), money(0))
    expect(ivaTotale.toFixed(2)).toBe('220.00')
  })

  it('usa l\'IVA dichiarata dalla fetta invece di stimarla pro-quota', () => {
    // Fattura ad aliquote miste: 1.000 di alimentari al 10% (1.100 lordi,
    // 100 di IVA) e 100 di detersivi al 22% (122 lordi, 22 di IVA).
    // Il pro-quota darebbe 109,82 e 12,18: quasi 10 € spostati dalla
    // famiglia piccola a quella grande.
    const aggregati = aggregaMovimenti([
      {
        accountId: 'fornitori',
        date: new Date(Date.UTC(2026, 6, 15)),
        debitAmount: 1222,
        creditAmount: 0,
        vatAmount: 122,
        allocations: [
          { accountId: 'alimentari', importo: 1100, iva: 100 },
          { accountId: 'pulizia', importo: 122, iva: 22 },
        ],
      },
    ])

    const alimentari = aggregati.find((a) => a.accountId === 'alimentari')
    const pulizia = aggregati.find((a) => a.accountId === 'pulizia')

    expect(alimentari?.ivaDare.toNumber()).toBe(100)
    expect(pulizia?.ivaDare.toNumber()).toBe(22)
  })

  it('ricade sul pro-quota quando la fetta non dichiara l\'IVA', () => {
    const aggregati = aggregaMovimenti([
      {
        accountId: 'fornitori',
        date: new Date(Date.UTC(2026, 6, 15)),
        debitAmount: 1222,
        creditAmount: 0,
        vatAmount: 122,
        allocations: [
          { accountId: 'alimentari', importo: 1100, iva: null },
          { accountId: 'pulizia', importo: 122, iva: null },
        ],
      },
    ])

    // 122 × (1100/1222) = 109,82 — il comportamento di prima, invariato.
    expect(aggregati.find((a) => a.accountId === 'alimentari')?.ivaDare.toNumber()).toBeCloseTo(109.82, 2)
  })
})
