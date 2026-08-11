import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatCurrencyOrDash,
  formatCurrencyOrZero,
  formatCurrencyPdf,
} from '../formatters'

/**
 * Il caso che questi test presidiano davvero è il raggruppamento delle migliaia
 * sui numeri di **quattro cifre**. Per l'italiano `Intl` usa `useGrouping: 'auto'`,
 * che raggruppa da cinque cifre in su: senza `useGrouping: true` esplicito
 * «1.234,56 €» diventa «1234,56 €» mentre «12.345,67 €» resta corretto — quindi
 * il difetto è invisibile a chi prova con numeri grandi, e colpisce proprio la
 * fascia in cui cade la maggior parte degli importi di un bar.
 *
 * È successo davvero: unificando 16 copie di `formatCurrency` in una sola,
 * l'opzione è andata persa e nessun test se n'è accorto.
 */
describe('formatCurrency', () => {
  it('raggruppa le migliaia anche sui numeri di quattro cifre', () => {
    expect(formatCurrency(1234.56)).toContain('1.234,56')
    expect(formatCurrency(9999.99)).toContain('9.999,99')
  })

  it('continua a raggruppare sopra le cinque cifre', () => {
    expect(formatCurrency(12345.67)).toContain('12.345,67')
    expect(formatCurrency(1234567.89)).toContain('1.234.567,89')
  })

  it('non raggruppa sotto il migliaio e tiene sempre due decimali', () => {
    expect(formatCurrency(999.5)).toContain('999,50')
    expect(formatCurrency(0)).toContain('0,00')
  })

  it('usa la virgola decimale e il simbolo dell euro', () => {
    const reso = formatCurrency(1234.56)
    expect(reso).toMatch(/1\.234,56/)
    expect(reso).toContain('€')
  })

  it('mantiene il segno negativo', () => {
    expect(formatCurrency(-1234.56)).toMatch(/-.*1\.234,56/)
  })
})

describe('le varianti si comportano come la principale sui numeri', () => {
  it('formatCurrencyOrDash raggruppa, e sull assente risponde un trattino', () => {
    expect(formatCurrencyOrDash(1234.56)).toContain('1.234,56')
    expect(formatCurrencyOrDash(null)).toBe('-')
    expect(formatCurrencyOrDash(undefined)).toBe('-')
    // Lo zero è un importo, non un'assenza: va scritto.
    expect(formatCurrencyOrDash(0)).toContain('0,00')
  })

  it('formatCurrencyOrZero raggruppa, accetta stringhe e sull assente risponde zero', () => {
    expect(formatCurrencyOrZero('1234.56')).toContain('1.234,56')
    expect(formatCurrencyOrZero(1234.56)).toContain('1.234,56')
    expect(formatCurrencyOrZero(null)).toBe('€ 0,00')
    expect(formatCurrencyOrZero('non un numero')).toBe('€ 0,00')
  })

  it('formatCurrencyPdf raggruppa, e su zero e assente lascia la cella vuota', () => {
    expect(formatCurrencyPdf(1234.56)).toBe('1.234,56 €')
    expect(formatCurrencyPdf(0)).toBe('')
    expect(formatCurrencyPdf(null)).toBe('')
    // Spazio normale prima dell'euro, non lo spazio unificatore di `Intl`:
    // alcuni renderer PDF non hanno il glifo per U+00A0.
    expect(formatCurrencyPdf(1234.56)).not.toContain(' ')
  })
})

import { formatNumeroCsv } from '../formatters'

describe('formatNumeroCsv', () => {
  it('usa la virgola decimale, che è ciò che Excel italiano si aspetta', () => {
    expect(formatNumeroCsv(1234.5)).toBe('1234,50')
    expect(formatNumeroCsv(0.05)).toBe('0,05')
  })

  it('NON raggruppa le migliaia: in una cella il punto è ambiguo fra locali diversi', () => {
    expect(formatNumeroCsv(1234567.89)).toBe('1234567,89')
  })

  it('tiene sempre due decimali', () => {
    expect(formatNumeroCsv(100)).toBe('100,00')
  })

  it('accetta le stringhe, che è la forma in cui gli importi arrivano da Prisma', () => {
    expect(formatNumeroCsv('1234.5')).toBe('1234,50')
  })

  it('rende la cella vuota, non uno zero, quando il valore manca', () => {
    expect(formatNumeroCsv(null)).toBe('')
    expect(formatNumeroCsv(undefined)).toBe('')
    expect(formatNumeroCsv('')).toBe('')
  })

  it('mantiene il segno negativo', () => {
    expect(formatNumeroCsv(-1234.5)).toBe('-1234,50')
  })
})
