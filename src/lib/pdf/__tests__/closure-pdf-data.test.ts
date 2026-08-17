import { describe, it, expect } from 'vitest'
import {
  calcolaTotaliPostazioni,
  totaleUsciteDaCassa,
  scomponiParziale,
  calcolaDeltaCaffe,
  formattaContatore,
  valoreDipendente,
  meteoHeader,
} from '../closure-pdf-data'

/**
 * I casi di prova usano i numeri veri della chiusura del 6 agosto 2026,
 * quella su cui i difetti sono stati visti a schermo e sul PDF stampato.
 */
const CHIUSURA_6_AGOSTO = {
  stazioni: [
    {
      name: 'BAR',
      receiptAmount: 2120.5,
      receiptVat: 192.77,
      invoiceAmount: 0,
      suspendedAmount: 0,
      cashAmount: 1157.8,
      posAmount: 1015.7,
      totalAmount: 2173.5,
    },
  ],
  uscite: [
    { paidBy: 'BAR', amount: 2.9 },
    { paidBy: 'BAR', amount: 50 },
    { paidBy: 'BAR', amount: 72 },
  ],
}

describe('totaleUsciteDaCassa', () => {
  it('somma le uscite pagate con il contante della cassa', () => {
    expect(totaleUsciteDaCassa(CHIUSURA_6_AGOSTO.uscite)).toBeCloseTo(124.9, 2)
  })

  it('esclude le uscite pagate da fonte esterna, che non hanno toccato la cassa', () => {
    const uscite = [
      { paidBy: 'BAR', amount: 50 },
      { paidBy: 'ESTERNO', amount: 200 },
    ]
    expect(totaleUsciteDaCassa(uscite)).toBe(50)
  })

  it('considera pagata dalla cassa un uscita senza postazione indicata', () => {
    expect(totaleUsciteDaCassa([{ paidBy: null, amount: 30 }])).toBe(30)
  })
})

describe('calcolaTotaliPostazioni', () => {
  const totali = calcolaTotaliPostazioni(
    CHIUSURA_6_AGOSTO.stazioni,
    CHIUSURA_6_AGOSTO.uscite
  )

  it('mostra il contante incassato, cioè quello rimasto in cassa più quello uscito', () => {
    expect(totali.cashAmount).toBeCloseTo(1282.7, 2)
  })

  it('espone a parte la quota di contante uscita per pagare le uscite', () => {
    expect(totali.usciteDaCassa).toBeCloseTo(124.9, 2)
  })

  it('QUADRA: il totale è la somma esatta di contanti e POS', () => {
    expect(totali.totalAmount).toBeCloseTo(totali.cashAmount + totali.posAmount, 2)
    expect(totali.totalAmount).toBeCloseTo(2298.4, 2)
  })

  it('somma le altre colonne senza alterarle', () => {
    expect(totali.receiptAmount).toBeCloseTo(2120.5, 2)
    expect(totali.receiptVat).toBeCloseTo(192.77, 2)
    expect(totali.posAmount).toBeCloseTo(1015.7, 2)
  })

  it('quadra anche senza uscite, dove il totale coincide con quello delle postazioni', () => {
    const totali = calcolaTotaliPostazioni(CHIUSURA_6_AGOSTO.stazioni, [])
    expect(totali.usciteDaCassa).toBe(0)
    expect(totali.totalAmount).toBeCloseTo(2173.5, 2)
    expect(totali.totalAmount).toBeCloseTo(totali.cashAmount + totali.posAmount, 2)
  })

  it('quadra su più postazioni', () => {
    const totali = calcolaTotaliPostazioni(
      [
        { ...CHIUSURA_6_AGOSTO.stazioni[0] },
        {
          name: 'DEHOR',
          receiptAmount: 100,
          receiptVat: 9,
          invoiceAmount: 0,
          suspendedAmount: 0,
          cashAmount: 60,
          posAmount: 40,
          totalAmount: 100,
        },
      ],
      CHIUSURA_6_AGOSTO.uscite
    )
    expect(totali.cashAmount).toBeCloseTo(1342.7, 2)
    expect(totali.posAmount).toBeCloseTo(1055.7, 2)
    expect(totali.totalAmount).toBeCloseTo(2398.4, 2)
    expect(totali.totalAmount).toBeCloseTo(totali.cashAmount + totali.posAmount, 2)
  })
})

describe('scomponiParziale', () => {
  it('tratta il progressivo come TOTALE, non come quota contanti', () => {
    // Nel form il campo è etichettato «Totale» e il POS ne è la quota interna:
    // sommarli conterebbe il POS due volte (448,80 + 112,20 = 561,00, sbagliato).
    const p = scomponiParziale({ receiptProgressive: 448.8, posProgressive: 112.2 })
    expect(p.totale).toBeCloseTo(448.8, 2)
    expect(p.pos).toBeCloseTo(112.2, 2)
    expect(p.contanti).toBeCloseTo(336.6, 2)
  })

  it('scompone anche il parziale della sera', () => {
    const p = scomponiParziale({ receiptProgressive: 998.2, posProgressive: 226 })
    expect(p.totale).toBeCloseTo(998.2, 2)
    expect(p.contanti).toBeCloseTo(772.2, 2)
  })

  it('non produce contanti negativi se il POS supera il totale per un errore di battitura', () => {
    const p = scomponiParziale({ receiptProgressive: 100, posProgressive: 150 })
    expect(p.contanti).toBe(0)
  })

  it('regge un parziale senza POS', () => {
    const p = scomponiParziale({ receiptProgressive: 200, posProgressive: 0 })
    expect(p.contanti).toBeCloseTo(200, 2)
  })
})

describe('calcolaDeltaCaffe', () => {
  it('calcola la differenza rispetto al parziale precedente', () => {
    // 9105 - 9099 = 6 caffè fatti fra le 16 e le 21
    expect(calcolaDeltaCaffe([9099, 9105], null)).toEqual([null, 6])
  })

  it('per il primo parziale usa il contatore dell ultima chiusura precedente', () => {
    expect(calcolaDeltaCaffe([9099, 9105], 9050)).toEqual([49, 6])
  })

  it('lascia vuoto il primo parziale quando non esiste una chiusura precedente', () => {
    expect(calcolaDeltaCaffe([9099], null)).toEqual([null])
  })

  it('lascia vuoto il parziale in cui il contatore non è stato letto', () => {
    // Il contatore è cumulativo: saltata una lettura, il parziale dopo misura
    // comunque i caffè veri, solo su due intervalli invece che su uno.
    expect(calcolaDeltaCaffe([9099, null, 9110], null)).toEqual([null, null, 11])
  })

  it('misura dall ultima lettura disponibile, non dal parziale immediatamente prima', () => {
    expect(calcolaDeltaCaffe([9099, null, 9110, 9120], null)).toEqual([null, null, 11, 10])
  })

  it('ammette il contatore azzerato o sostituito, che dà differenza negativa', () => {
    expect(calcolaDeltaCaffe([9099, 12], null)).toEqual([null, -9087])
  })
})

describe('formattaContatore', () => {
  it('mette il punto come separatore delle migliaia', () => {
    expect(formattaContatore(9105)).toBe('9.105')
    expect(formattaContatore(9099)).toBe('9.099')
  })

  it('lascia intatti i numeri sotto il migliaio', () => {
    expect(formattaContatore(842)).toBe('842')
  })

  it('separa anche le decine di migliaia', () => {
    expect(formattaContatore(124500)).toBe('124.500')
  })
})

describe('valoreDipendente', () => {
  it('mostra le ore di chi era presente, non la lettera P', () => {
    expect(valoreDipendente({ statusCode: 'P', hours: 9 })).toBe('9h')
  })

  it('scrive le mezze ore con la virgola', () => {
    expect(valoreDipendente({ statusCode: 'P', hours: 7.5 })).toBe('7,5h')
  })

  it('mostra il codice di chi era assente, senza parentesi', () => {
    expect(valoreDipendente({ statusCode: 'R', hours: null })).toBe('R')
    expect(valoreDipendente({ statusCode: 'FE', hours: null })).toBe('FE')
    expect(valoreDipendente({ statusCode: 'Z', hours: null })).toBe('Z')
    expect(valoreDipendente({ statusCode: 'C', hours: null })).toBe('C')
  })

  it('ripiega sulla P quando le ore del presente non sono state compilate', () => {
    expect(valoreDipendente({ statusCode: 'P', hours: null })).toBe('P')
    expect(valoreDipendente({ statusCode: 'P', hours: 0 })).toBe('P')
  })

  it('non inventa nulla quando manca anche il codice', () => {
    expect(valoreDipendente({ statusCode: null, hours: null })).toBe('-')
  })

  it('mostra le ore anche se il codice manca ma le ore ci sono', () => {
    expect(valoreDipendente({ statusCode: null, hours: 6 })).toBe('6h')
  })
})

describe('meteoHeader', () => {
  it('usa la stessa emoji dei parziali invece del testo grezzo', () => {
    expect(
      meteoHeader({
        weatherMorning: 'sunny',
        weatherAfternoon: 'sunny',
        weatherEvening: 'sunny',
      })
    ).toBe('Matt ☀️  Pom ☀️  Sera ☀️')
  })

  it('cambia emoji per ogni fascia', () => {
    expect(
      meteoHeader({
        weatherMorning: 'rainy',
        weatherAfternoon: 'cloudy',
        weatherEvening: 'stormy',
      })
    ).toBe('Matt 🌧️  Pom ☁️  Sera ⛈️')
  })

  it('salta le fasce non compilate', () => {
    expect(
      meteoHeader({
        weatherMorning: 'sunny',
        weatherAfternoon: null,
        weatherEvening: null,
      })
    ).toBe('Matt ☀️')
  })

  it('ripiega sul testo se il valore non ha una emoji conosciuta', () => {
    expect(
      meteoHeader({
        weatherMorning: 'grandine',
        weatherAfternoon: null,
        weatherEvening: null,
      })
    ).toBe('Matt grandine')
  })

  it('restituisce il trattino quando il meteo non è stato indicato', () => {
    expect(
      meteoHeader({ weatherMorning: null, weatherAfternoon: null, weatherEvening: null })
    ).toBe('-')
  })
})
