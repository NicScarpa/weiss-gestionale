import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { money, round2, toDb, toApi, sumMoney, isSettled } from '../money'

/**
 * Il denaro non è un `number`.
 *
 * Questi test fissano le due proprietà per cui esiste `money.ts`: gli importi
 * si sommano senza l'errore della virgola mobile, e la conversione a `number`
 * avviene una volta sola, in fondo, quando il valore esce verso la UI.
 */

describe('money', () => {
  it('somma 0,10 e 0,20 senza lo strascico della virgola mobile', () => {
    // In virgola mobile 0.1 + 0.2 fa 0.30000000000000004: è il motivo per cui
    // gli importi non attraversano mai `number` nei passaggi intermedi.
    expect(0.1 + 0.2).not.toBe(0.3)

    expect(money(0.1).plus(money(0.2)).toString()).toBe('0.3')
  })

  it('legge numeri, stringhe e Decimal di Prisma', () => {
    expect(money(10.5).toString()).toBe('10.5')
    expect(money('10.50').toString()).toBe('10.5')
    expect(money(new Prisma.Decimal('10.50')).toString()).toBe('10.5')
  })

  it('tratta un importo assente come zero', () => {
    expect(money(null).toString()).toBe('0')
    expect(money(undefined).toString()).toBe('0')
  })

  it('rifiuta ciò che non è un importo invece di farlo diventare zero', () => {
    // Un NaN che scivola in contabilità come 0 è un ammanco silenzioso.
    expect(() => money(Number.NaN)).toThrow()
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow()
    expect(() => money('')).toThrow()
    expect(() => money('mille euro')).toThrow()
  })
})

describe('round2', () => {
  it('arrotonda il mezzo centesimo per eccesso', () => {
    expect(round2(1.005).toString()).toBe('1.01')
    expect(round2(2.675).toString()).toBe('2.68')
    expect(round2(-1.005).toString()).toBe('-1.01')
  })

  it('lascia intatto ciò che ha già due decimali', () => {
    expect(round2('1234.56').toString()).toBe('1234.56')
  })
})

describe('sumMoney', () => {
  it('somma mille importi da 0,10 € e fa esattamente 100 €', () => {
    const importi = Array.from({ length: 1000 }, () => 0.1)

    expect(sumMoney(importi).toString()).toBe('100')
    expect(toApi(sumMoney(importi))).toBe(100)
  })

  it('accetta indifferentemente un elenco o un array', () => {
    expect(sumMoney(0.1, '0.2', new Prisma.Decimal('0.3')).toString()).toBe('0.6')
    expect(sumMoney([0.1, '0.2', new Prisma.Decimal('0.3')]).toString()).toBe('0.6')
  })

  it('somma zero addendi e fa zero', () => {
    expect(sumMoney().toString()).toBe('0')
    expect(sumMoney([]).toString()).toBe('0')
  })

  it('salta gli importi assenti', () => {
    expect(sumMoney([1.1, null, 2.2, undefined]).toString()).toBe('3.3')
  })
})

describe('toDb', () => {
  it('restituisce un Decimal di Prisma con due decimali', () => {
    const valore = toDb(10.005)

    expect(valore).toBeInstanceOf(Prisma.Decimal)
    expect(valore.toFixed(2)).toBe('10.01')
  })

  it('non perde precisione passando dalla somma alla colonna', () => {
    const totale = sumMoney(Array.from({ length: 3 }, () => 0.1))

    expect(toDb(totale).toFixed(2)).toBe('0.30')
  })
})

describe('toApi', () => {
  it('converte in number arrotondando a due decimali', () => {
    expect(toApi(new Prisma.Decimal('1234.5678'))).toBe(1234.57)
    expect(toApi(null)).toBe(0)
  })
})

describe('isSettled', () => {
  it('considera saldato ciò che è pagato per intero o in eccesso', () => {
    expect(isSettled(100, 100)).toBe(true)
    expect(isSettled(100.01, 100)).toBe(true)
    expect(isSettled(0, 0)).toBe(true)
  })

  it('tollera uno scarto di mezzo centesimo', () => {
    // Il residuo di 0,005 € nasce dagli arrotondamenti, non da un debito:
    // lasciare la scadenza aperta per mezzo centesimo è solo rumore.
    expect(isSettled(99.995, 100)).toBe(true)
  })

  it('un centesimo mancante non è saldato', () => {
    expect(isSettled(99.99, 100)).toBe(false)
    expect(isSettled(0, 100)).toBe(false)
  })
})
