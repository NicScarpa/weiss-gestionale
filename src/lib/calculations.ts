import Decimal from 'decimal.js'
import {
  ALL_DENOMINATIONS,
  BILL_DENOMINATIONS,
  COIN_DENOMINATIONS,
  DEFAULT_VAT_RATE,
  DEFAULT_CASH_FLOAT,
  CASH_DIFFERENCE_THRESHOLD
} from '@/lib/constants'
import type { CashStationFormData, ClosureCalculations } from '@/types/chiusura-cassa'

// Configura Decimal.js per precisione finanziaria
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

/**
 * Calcola il totale di un conteggio cassa
 */
export function calculateCashStationTotal(counts: Record<string, number>): number {
  let total = new Decimal(0)

  for (const [denomination, quantity] of Object.entries(counts)) {
    const denomValue = new Decimal(denomination)
    const qty = new Decimal(quantity || 0)
    total = total.plus(denomValue.times(qty))
  }

  return total.toNumber()
}

/**
 * Calcola il totale di tutte le postazioni
 */
export function calculateGrossTotal(cashStations: CashStationFormData[]): number {
  let total = new Decimal(0)

  for (const station of cashStations) {
    total = total.plus(calculateCashStationTotal(station.counts))
  }

  return total.toNumber()
}

/**
 * Calcola l'IVA
 */
export function calculateVat(grossTotal: number, vatRate: number = DEFAULT_VAT_RATE): number {
  const gross = new Decimal(grossTotal)
  const rate = new Decimal(vatRate)

  // IVA = Lordo - (Lordo / (1 + aliquota))
  const net = gross.dividedBy(new Decimal(1).plus(rate))
  const vat = gross.minus(net)

  return vat.toDecimalPlaces(2).toNumber()
}

/**
 * Calcola il totale netto (lordo - IVA)
 */
export function calculateNetTotal(grossTotal: number, vatRate: number = DEFAULT_VAT_RATE): number {
  const gross = new Decimal(grossTotal)
  const vat = new Decimal(calculateVat(grossTotal, vatRate))

  return gross.minus(vat).toNumber()
}

/**
 * Calcola il totale delle uscite
 */
export function calculateExpensesTotal(expenses: { amount: number }[]): number {
  let total = new Decimal(0)

  for (const expense of expenses) {
    total = total.plus(new Decimal(expense.amount || 0))
  }

  return total.toNumber()
}

/**
 * Calcola il contante atteso in cassa
 * Contante atteso = Totale lordo - Uscite - Versamento banca + Fondo cassa
 */
export function calculateExpectedCash(
  grossTotal: number,
  expensesTotal: number,
  bankDeposit: number,
  cashFloat: number = DEFAULT_CASH_FLOAT
): number {
  const gross = new Decimal(grossTotal)
  const expenses = new Decimal(expensesTotal)
  const deposit = new Decimal(bankDeposit)
  const float = new Decimal(cashFloat)

  return gross.minus(expenses).minus(deposit).plus(float).toNumber()
}

/**
 * Calcola la differenza cassa
 * Differenza = Contante effettivo - Contante atteso
 */
export function calculateCashDifference(actualCash: number, expectedCash: number): number {
  const actual = new Decimal(actualCash)
  const expected = new Decimal(expectedCash)

  return actual.minus(expected).toNumber()
}

/**
 * Verifica se la differenza è entro la soglia di tolleranza
 */
export function isWithinThreshold(
  difference: number,
  threshold: number = CASH_DIFFERENCE_THRESHOLD
): boolean {
  return Math.abs(difference) <= threshold
}

/**
 * Calcola tutti i totali della chiusura
 */
export function calculateClosureTotals(
  cashStations: CashStationFormData[],
  expenses: { amount: number }[],
  bankDeposit: number,
  posTotal: number = 0,
  cashFloat: number = DEFAULT_CASH_FLOAT,
  vatRate: number = DEFAULT_VAT_RATE
): ClosureCalculations {
  const grossTotal = calculateGrossTotal(cashStations)
  const vatAmount = calculateVat(grossTotal, vatRate)
  const netTotal = calculateNetTotal(grossTotal, vatRate)
  const expensesTotal = calculateExpensesTotal(expenses)
  const expectedCash = calculateExpectedCash(grossTotal, expensesTotal, bankDeposit, cashFloat)
  const actualCash = grossTotal // Per ora il contante effettivo è il totale delle postazioni
  const cashDifference = calculateCashDifference(actualCash, expectedCash)

  return {
    grossTotal,
    vatRate,
    vatAmount,
    netTotal,
    expensesTotal,
    cashFloat,
    bankDeposit,
    posTotal,
    expectedCash,
    actualCash,
    cashDifference,
    isWithinThreshold: isWithinThreshold(cashDifference),
  }
}

/**
 * Inizializza un oggetto counts vuoto con tutti i tagli
 */
export function initializeEmptyCounts(): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const denomination of ALL_DENOMINATIONS) {
    counts[denomination.toString()] = 0
  }

  return counts
}

/**
 * Separa i conteggi in banconote e monete
 */
export function separateBillsAndCoins(counts: Record<string, number>): {
  bills: Record<string, number>
  coins: Record<string, number>
} {
  const bills: Record<string, number> = {}
  const coins: Record<string, number> = {}

  for (const [denomination, quantity] of Object.entries(counts)) {
    const denomValue = parseFloat(denomination)
    if (BILL_DENOMINATIONS.includes(denomValue as any)) {
      bills[denomination] = quantity
    } else if (COIN_DENOMINATIONS.includes(denomValue as any)) {
      coins[denomination] = quantity
    }
  }

  return { bills, coins }
}
