import { describe, it, expect } from 'vitest'
import { calculateBankDeposit } from '../closure-service'

/**
 * Il versamento in banca è il numero che chiude la giornata: sbagliarlo
 * significa una prima nota che non torna. Prima dell'estrazione del service
 * questa logica viveva dentro la route ed era testabile solo via HTTP.
 */
describe('calculateBankDeposit', () => {
  it('sottrae fondi cassa e uscite dal contante incassato', () => {
    const deposit = calculateBankDeposit(
      [{ cashAmount: 1000, floatAmount: 114 }],
      [{ amount: 50 }]
    )

    expect(deposit).toBe(836)
  })

  it('somma su più postazioni', () => {
    const deposit = calculateBankDeposit(
      [
        { cashAmount: 600, floatAmount: 100 },
        { cashAmount: 400, floatAmount: 50 },
      ],
      [{ amount: 30 }, { amount: 20 }]
    )

    // (600 + 400) - (100 + 50) - (30 + 20)
    expect(deposit).toBe(800)
  })

  it('non restituisce mai un versamento negativo', () => {
    const deposit = calculateBankDeposit(
      [{ cashAmount: 100, floatAmount: 114 }],
      [{ amount: 200 }]
    )

    expect(deposit).toBe(0)
  })

  it('tratta gli importi mancanti come zero', () => {
    const deposit = calculateBankDeposit(
      [
        { cashAmount: null, floatAmount: null },
        { cashAmount: 500, floatAmount: 114 },
      ],
      []
    )

    expect(deposit).toBe(386)
  })

  it('accetta i Decimal di Prisma', () => {
    // Prisma restituisce Decimal, non number: il service deve gestirli
    const decimal = (n: number) => ({ toNumber: () => n })

    const deposit = calculateBankDeposit(
      [{ cashAmount: decimal(1000), floatAmount: decimal(114) }],
      [{ amount: decimal(50) }]
    )

    expect(deposit).toBe(836)
  })

  it('gestisce una giornata senza incassi', () => {
    expect(calculateBankDeposit([], [])).toBe(0)
  })

  it('mantiene la precisione sui centesimi', () => {
    const deposit = calculateBankDeposit(
      [{ cashAmount: 1000.55, floatAmount: 114.05 }],
      [{ amount: 50.25 }]
    )

    expect(deposit).toBeCloseTo(836.25, 2)
  })
})
