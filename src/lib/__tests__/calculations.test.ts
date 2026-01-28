import { describe, it, expect } from 'vitest'
import {
  calculateCashStationTotal,
  calculateGrossTotal,
  calculateVat,
  calculateNetTotal,
  calculateExpensesTotal,
  calculateExpectedCash,
  calculateCashDifference,
  isWithinThreshold,
  calculateClosureTotals,
  initializeEmptyCounts,
  separateBillsAndCoins,
} from '../calculations'
import {
  DEFAULT_VAT_RATE,
  DEFAULT_CASH_FLOAT,
  CASH_DIFFERENCE_THRESHOLD,
  ALL_DENOMINATIONS,
  BILL_DENOMINATIONS,
  COIN_DENOMINATIONS,
} from '../constants'
import type { CashStationFormData } from '@/types/chiusura-cassa'

describe('calculateCashStationTotal', () => {
  it('should return 0 for empty counts', () => {
    expect(calculateCashStationTotal({})).toBe(0)
  })

  it('should calculate total for single denomination', () => {
    expect(calculateCashStationTotal({ '50': 2 })).toBe(100)
    expect(calculateCashStationTotal({ '20': 5 })).toBe(100)
    expect(calculateCashStationTotal({ '10': 10 })).toBe(100)
  })

  it('should calculate total for multiple bills', () => {
    const counts = {
      '100': 1,
      '50': 2,
      '20': 3,
      '10': 4,
    }
    // 100 + 100 + 60 + 40 = 300
    expect(calculateCashStationTotal(counts)).toBe(300)
  })

  it('should calculate total for coins', () => {
    const counts = {
      '2': 5,    // 10
      '1': 10,   // 10
      '0.5': 4,  // 2
      '0.2': 5,  // 1
      '0.1': 10, // 1
    }
    // 10 + 10 + 2 + 1 + 1 = 24
    expect(calculateCashStationTotal(counts)).toBe(24)
  })

  it('should calculate total for mixed bills and coins', () => {
    const counts = {
      '50': 1,   // 50
      '20': 2,   // 40
      '2': 3,    // 6
      '0.5': 2,  // 1
      '0.1': 3,  // 0.3
    }
    // 50 + 40 + 6 + 1 + 0.3 = 97.3
    expect(calculateCashStationTotal(counts)).toBeCloseTo(97.3, 2)
  })

  it('should handle zero quantities', () => {
    const counts = {
      '50': 0,
      '20': 0,
      '10': 0,
    }
    expect(calculateCashStationTotal(counts)).toBe(0)
  })

  it('should handle undefined/null quantities as 0', () => {
    const counts = {
      '50': undefined as unknown as number,
      '20': null as unknown as number,
      '10': 5,
    }
    expect(calculateCashStationTotal(counts)).toBe(50)
  })

  it('should handle small coin denominations precisely', () => {
    const counts = {
      '0.05': 20, // 1.00
      '0.01': 100, // 1.00
    }
    expect(calculateCashStationTotal(counts)).toBeCloseTo(2, 2)
  })

  it('should handle large amounts correctly', () => {
    const counts = {
      '500': 10, // 5000
      '200': 5,  // 1000
      '100': 20, // 2000
    }
    expect(calculateCashStationTotal(counts)).toBe(8000)
  })
})

describe('calculateGrossTotal', () => {
  it('should return 0 for empty stations array', () => {
    expect(calculateGrossTotal([])).toBe(0)
  })

  it('should calculate total for single station', () => {
    const stations = [
      { counts: { '50': 2, '20': 3 } },
    ] as unknown as CashStationFormData[]
    // 100 + 60 = 160
    expect(calculateGrossTotal(stations)).toBe(160)
  })

  it('should sum totals from multiple stations', () => {
    const stations = [
      { counts: { '50': 2 } },  // 100
      { counts: { '20': 5 } },  // 100
      { counts: { '10': 10 } }, // 100
    ] as unknown as CashStationFormData[]
    expect(calculateGrossTotal(stations)).toBe(300)
  })

  it('should handle stations with empty counts', () => {
    const stations = [
      { counts: { '50': 2 } }, // 100
      { counts: {} },          // 0
      { counts: { '20': 1 } }, // 20
    ] as unknown as CashStationFormData[]
    expect(calculateGrossTotal(stations)).toBe(120)
  })
})

describe('calculateVat', () => {
  it('should calculate VAT with default 10% rate', () => {
    // VAT = Gross - (Gross / 1.10)
    // For 110: VAT = 110 - 100 = 10
    expect(calculateVat(110)).toBe(10)
  })

  it('should calculate VAT for different amounts', () => {
    expect(calculateVat(220)).toBe(20)
    expect(calculateVat(550)).toBe(50)
    expect(calculateVat(1100)).toBe(100)
  })

  it('should return 0 for zero amount', () => {
    expect(calculateVat(0)).toBe(0)
  })

  it('should handle custom VAT rate', () => {
    // With 22% VAT rate
    // For 122: VAT = 122 - 100 = 22
    expect(calculateVat(122, 0.22)).toBe(22)
  })

  it('should round to 2 decimal places', () => {
    // 115.50 with 10% VAT
    // VAT = 115.50 - (115.50 / 1.10) = 115.50 - 105 = 10.50
    expect(calculateVat(115.50)).toBe(10.5)
  })

  it('should handle amounts with many decimals', () => {
    const vat = calculateVat(123.456789)
    // Should be rounded to 2 decimal places
    expect(Number.isFinite(vat)).toBe(true)
    expect(vat.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2)
  })

  it('should handle very small amounts', () => {
    expect(calculateVat(1.10)).toBeCloseTo(0.10, 2)
  })

  it('should handle very large amounts', () => {
    expect(calculateVat(110000)).toBe(10000)
  })
})

describe('calculateNetTotal', () => {
  it('should calculate net total (gross - VAT)', () => {
    expect(calculateNetTotal(110)).toBe(100)
    expect(calculateNetTotal(220)).toBe(200)
  })

  it('should return 0 for zero amount', () => {
    expect(calculateNetTotal(0)).toBe(0)
  })

  it('should handle custom VAT rate', () => {
    expect(calculateNetTotal(122, 0.22)).toBe(100)
  })

  it('should be consistent with calculateVat', () => {
    const grossTotal = 550
    const vat = calculateVat(grossTotal)
    const net = calculateNetTotal(grossTotal)
    expect(grossTotal - vat).toBeCloseTo(net, 2)
  })
})

describe('calculateExpensesTotal', () => {
  it('should return 0 for empty expenses array', () => {
    expect(calculateExpensesTotal([])).toBe(0)
  })

  it('should sum single expense', () => {
    expect(calculateExpensesTotal([{ amount: 50 }])).toBe(50)
  })

  it('should sum multiple expenses', () => {
    const expenses = [
      { amount: 50 },
      { amount: 30 },
      { amount: 20.50 },
    ]
    expect(calculateExpensesTotal(expenses)).toBeCloseTo(100.50, 2)
  })

  it('should handle zero amounts', () => {
    const expenses = [
      { amount: 50 },
      { amount: 0 },
      { amount: 50 },
    ]
    expect(calculateExpensesTotal(expenses)).toBe(100)
  })

  it('should handle undefined/null amounts as 0', () => {
    const expenses = [
      { amount: 50 },
      { amount: undefined as unknown as number },
      { amount: null as unknown as number },
    ]
    expect(calculateExpensesTotal(expenses)).toBe(50)
  })
})

describe('calculateExpectedCash', () => {
  it('should calculate with default cash float', () => {
    // Expected = Gross - Expenses - Bank + Float
    // 500 - 100 - 0 + 114 = 514
    expect(calculateExpectedCash(500, 100, 0)).toBe(514)
  })

  it('should account for bank deposit', () => {
    // 500 - 100 - 200 + 114 = 314
    expect(calculateExpectedCash(500, 100, 200)).toBe(314)
  })

  it('should handle custom cash float', () => {
    // 500 - 100 - 0 + 100 = 500
    expect(calculateExpectedCash(500, 100, 0, 100)).toBe(500)
  })

  it('should return just float when no activity', () => {
    expect(calculateExpectedCash(0, 0, 0)).toBe(DEFAULT_CASH_FLOAT)
  })

  it('should handle all parameters', () => {
    // Gross 1000, Expenses 200, Bank 500, Float 150
    // 1000 - 200 - 500 + 150 = 450
    expect(calculateExpectedCash(1000, 200, 500, 150)).toBe(450)
  })

  it('should handle decimal values', () => {
    expect(calculateExpectedCash(100.50, 20.25, 30.10, 114)).toBeCloseTo(164.15, 2)
  })
})

describe('calculateCashDifference', () => {
  it('should return 0 when actual equals expected', () => {
    expect(calculateCashDifference(500, 500)).toBe(0)
  })

  it('should return positive difference when actual > expected', () => {
    expect(calculateCashDifference(550, 500)).toBe(50)
  })

  it('should return negative difference when actual < expected', () => {
    expect(calculateCashDifference(450, 500)).toBe(-50)
  })

  it('should handle decimal values', () => {
    expect(calculateCashDifference(500.50, 500)).toBeCloseTo(0.50, 2)
    expect(calculateCashDifference(499.50, 500)).toBeCloseTo(-0.50, 2)
  })

  it('should handle zero values', () => {
    expect(calculateCashDifference(0, 0)).toBe(0)
    expect(calculateCashDifference(100, 0)).toBe(100)
    expect(calculateCashDifference(0, 100)).toBe(-100)
  })
})

describe('isWithinThreshold', () => {
  it('should return true for zero difference', () => {
    expect(isWithinThreshold(0)).toBe(true)
  })

  it('should return true for difference within default threshold (5.00)', () => {
    expect(isWithinThreshold(4.99)).toBe(true)
    expect(isWithinThreshold(-4.99)).toBe(true)
    expect(isWithinThreshold(5.00)).toBe(true)
    expect(isWithinThreshold(-5.00)).toBe(true)
  })

  it('should return false for difference beyond default threshold', () => {
    expect(isWithinThreshold(5.01)).toBe(false)
    expect(isWithinThreshold(-5.01)).toBe(false)
    expect(isWithinThreshold(10)).toBe(false)
    expect(isWithinThreshold(-10)).toBe(false)
  })

  it('should handle custom threshold', () => {
    expect(isWithinThreshold(10, 15)).toBe(true)
    expect(isWithinThreshold(-10, 15)).toBe(true)
    expect(isWithinThreshold(16, 15)).toBe(false)
  })

  it('should use CASH_DIFFERENCE_THRESHOLD constant', () => {
    expect(isWithinThreshold(CASH_DIFFERENCE_THRESHOLD)).toBe(true)
    expect(isWithinThreshold(CASH_DIFFERENCE_THRESHOLD + 0.01)).toBe(false)
  })
})

describe('calculateClosureTotals', () => {
  const mockStations = [
    {
      counts: { '50': 2, '20': 3 }, // 160
    },
    {
      counts: { '10': 10, '5': 4 }, // 120
    },
  ] as unknown as CashStationFormData[]

  const mockExpenses = [
    { amount: 30 },
    { amount: 20 },
  ]

  it('should calculate all totals for simple closure', () => {
    const result = calculateClosureTotals(
      mockStations,
      mockExpenses,
      0,  // bank deposit
      100, // POS total
    )

    expect(result.grossTotal).toBe(280) // 160 + 120
    expect(result.expensesTotal).toBe(50)
    expect(result.vatRate).toBe(DEFAULT_VAT_RATE)
    expect(result.cashFloat).toBe(DEFAULT_CASH_FLOAT)
  })

  it('should calculate VAT correctly', () => {
    const result = calculateClosureTotals(mockStations, [], 0, 0)

    expect(result.vatAmount).toBeCloseTo(calculateVat(280), 2)
    expect(result.netTotal).toBeCloseTo(calculateNetTotal(280), 2)
  })

  it('should calculate expected cash correctly', () => {
    const result = calculateClosureTotals(
      mockStations,
      mockExpenses,
      50,  // bank deposit
      0,
    )

    // Expected = Gross - Expenses - Bank + Float
    // 280 - 50 - 50 + 114 = 294
    expect(result.expectedCash).toBe(294)
  })

  it('should detect significant cash difference', () => {
    const result = calculateClosureTotals(
      mockStations,
      mockExpenses,
      0,
      0,
    )

    // actualCash = grossTotal = 280
    // expectedCash = 280 - 50 - 0 + 114 = 344
    // difference = 280 - 344 = -64
    expect(result.cashDifference).toBe(280 - result.expectedCash)
    expect(result.isWithinThreshold).toBe(Math.abs(result.cashDifference) <= CASH_DIFFERENCE_THRESHOLD)
  })

  it('should handle empty closure', () => {
    const result = calculateClosureTotals([], [], 0, 0)

    expect(result.grossTotal).toBe(0)
    expect(result.expensesTotal).toBe(0)
    expect(result.vatAmount).toBe(0)
    expect(result.netTotal).toBe(0)
    expect(result.expectedCash).toBe(DEFAULT_CASH_FLOAT)
    expect(result.actualCash).toBe(0)
    expect(result.isWithinThreshold).toBe(false) // -114 difference
  })

  it('should use custom VAT rate', () => {
    const result = calculateClosureTotals(
      mockStations,
      [],
      0,
      0,
      DEFAULT_CASH_FLOAT,
      0.22, // 22% VAT
    )

    expect(result.vatRate).toBe(0.22)
    expect(result.vatAmount).toBeCloseTo(calculateVat(280, 0.22), 2)
  })

  it('should use custom cash float', () => {
    const result = calculateClosureTotals(
      mockStations,
      [],
      0,
      0,
      200, // custom float
    )

    expect(result.cashFloat).toBe(200)
    expect(result.expectedCash).toBe(280 - 0 - 0 + 200)
  })
})

describe('initializeEmptyCounts', () => {
  it('should initialize all denominations to 0', () => {
    const counts = initializeEmptyCounts()

    for (const denom of ALL_DENOMINATIONS) {
      expect(counts[denom.toString()]).toBe(0)
    }
  })

  it('should have correct number of denominations', () => {
    const counts = initializeEmptyCounts()
    expect(Object.keys(counts).length).toBe(ALL_DENOMINATIONS.length)
  })

  it('should include all bill denominations', () => {
    const counts = initializeEmptyCounts()

    for (const denom of BILL_DENOMINATIONS) {
      expect(counts[denom.toString()]).toBeDefined()
    }
  })

  it('should include all coin denominations', () => {
    const counts = initializeEmptyCounts()

    for (const denom of COIN_DENOMINATIONS) {
      expect(counts[denom.toString()]).toBeDefined()
    }
  })
})

describe('separateBillsAndCoins', () => {
  it('should separate bills and coins correctly', () => {
    const counts = {
      '50': 2,
      '20': 3,
      '2': 5,
      '0.5': 4,
    }

    const { bills, coins } = separateBillsAndCoins(counts)

    expect(bills['50']).toBe(2)
    expect(bills['20']).toBe(3)
    expect(coins['2']).toBe(5)
    expect(coins['0.5']).toBe(4)
  })

  it('should return empty objects for empty counts', () => {
    const { bills, coins } = separateBillsAndCoins({})

    expect(Object.keys(bills).length).toBe(0)
    expect(Object.keys(coins).length).toBe(0)
  })

  it('should only include bills in bills object', () => {
    const counts = initializeEmptyCounts()
    counts['50'] = 5
    counts['0.5'] = 10

    const { bills } = separateBillsAndCoins(counts)

    // Should only have bill denominations
    for (const key of Object.keys(bills)) {
      const value = parseFloat(key)
      expect(BILL_DENOMINATIONS).toContain(value)
    }
  })

  it('should only include coins in coins object', () => {
    const counts = initializeEmptyCounts()
    counts['50'] = 5
    counts['0.5'] = 10

    const { coins } = separateBillsAndCoins(counts)

    // Should only have coin denominations
    for (const key of Object.keys(coins)) {
      const value = parseFloat(key)
      expect(COIN_DENOMINATIONS).toContain(value)
    }
  })
})

describe('Decimal precision', () => {
  it('should handle floating point precision correctly', () => {
    // Classic floating point issue: 0.1 + 0.2 !== 0.3 in JavaScript
    const counts = {
      '0.1': 1,
      '0.2': 1,
    }
    // Should be exactly 0.3, not 0.30000000000000004
    expect(calculateCashStationTotal(counts)).toBeCloseTo(0.3, 10)
  })

  it('should maintain precision across many calculations', () => {
    const counts: Record<string, number> = {}
    // Add 100 x 0.01 cents
    counts['0.01'] = 100

    expect(calculateCashStationTotal(counts)).toBe(1)
  })

  it('should handle typical closure amounts precisely', () => {
    // Simulate a typical day's closure
    const counts = {
      '50': 3,     // 150
      '20': 8,     // 160
      '10': 12,    // 120
      '5': 6,      // 30
      '2': 15,     // 30
      '1': 20,     // 20
      '0.5': 10,   // 5
      '0.2': 25,   // 5
      '0.1': 30,   // 3
      '0.05': 20,  // 1
      '0.01': 50,  // 0.50
    }

    // Total should be 524.50
    expect(calculateCashStationTotal(counts)).toBeCloseTo(524.50, 2)
  })
})

describe('Edge cases', () => {
  it('should handle negative amounts gracefully', () => {
    // While negative amounts shouldn't happen in real usage,
    // the function should handle them mathematically
    const counts = { '50': -1 }
    expect(calculateCashStationTotal(counts)).toBe(-50)
  })

  it('should handle very large quantities', () => {
    const counts = { '500': 1000 }
    expect(calculateCashStationTotal(counts)).toBe(500000)
  })

  it('should handle string number keys', () => {
    // Counts use string keys for denominations
    const counts = {
      '0.01': 1,
      '0.1': 1,
      '1': 1,
      '10': 1,
    }
    expect(calculateCashStationTotal(counts)).toBeCloseTo(11.11, 2)
  })
})
