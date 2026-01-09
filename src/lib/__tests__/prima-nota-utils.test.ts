import { describe, it, expect } from 'vitest'
import {
  getMovementDirection,
  toDebitCredit,
  calculateRunningBalances,
  calculateTotals,
  generateClosureDescription,
  formatSignedAmount,
  isEntryEditable,
  groupEntriesByDate,
} from '../prima-nota-utils'

describe('getMovementDirection', () => {
  describe('CASH register', () => {
    it('should return DEBIT for INCASSO (money in)', () => {
      expect(getMovementDirection('CASH', 'INCASSO')).toBe('DEBIT')
    })

    it('should return DEBIT for PRELIEVO (withdrawal from bank to cash)', () => {
      expect(getMovementDirection('CASH', 'PRELIEVO')).toBe('DEBIT')
    })

    it('should return CREDIT for USCITA (money out)', () => {
      expect(getMovementDirection('CASH', 'USCITA')).toBe('CREDIT')
    })

    it('should return CREDIT for VERSAMENTO (deposit to bank)', () => {
      expect(getMovementDirection('CASH', 'VERSAMENTO')).toBe('CREDIT')
    })

    it('should return DEBIT for GIROCONTO (default)', () => {
      expect(getMovementDirection('CASH', 'GIROCONTO')).toBe('DEBIT')
    })
  })

  describe('BANK register', () => {
    it('should return DEBIT for INCASSO (money in)', () => {
      expect(getMovementDirection('BANK', 'INCASSO')).toBe('DEBIT')
    })

    it('should return DEBIT for VERSAMENTO (deposit from cash)', () => {
      expect(getMovementDirection('BANK', 'VERSAMENTO')).toBe('DEBIT')
    })

    it('should return CREDIT for USCITA (money out)', () => {
      expect(getMovementDirection('BANK', 'USCITA')).toBe('CREDIT')
    })

    it('should return CREDIT for PRELIEVO (withdrawal to cash)', () => {
      expect(getMovementDirection('BANK', 'PRELIEVO')).toBe('CREDIT')
    })

    it('should return DEBIT for GIROCONTO (default)', () => {
      expect(getMovementDirection('BANK', 'GIROCONTO')).toBe('DEBIT')
    })
  })
})

describe('toDebitCredit', () => {
  it('should return debit for CASH INCASSO', () => {
    const result = toDebitCredit('CASH', 'INCASSO', 100)
    expect(result).toEqual({ debitAmount: 100, creditAmount: null })
  })

  it('should return credit for CASH USCITA', () => {
    const result = toDebitCredit('CASH', 'USCITA', 50)
    expect(result).toEqual({ debitAmount: null, creditAmount: 50 })
  })

  it('should return debit for BANK VERSAMENTO', () => {
    const result = toDebitCredit('BANK', 'VERSAMENTO', 200)
    expect(result).toEqual({ debitAmount: 200, creditAmount: null })
  })

  it('should return credit for BANK PRELIEVO', () => {
    const result = toDebitCredit('BANK', 'PRELIEVO', 150)
    expect(result).toEqual({ debitAmount: null, creditAmount: 150 })
  })
})

describe('calculateRunningBalances', () => {
  it('should return empty array for empty input', () => {
    expect(calculateRunningBalances([])).toEqual([])
  })

  it('should calculate running balance for single entry', () => {
    const entries = [
      { id: '1', debitAmount: 100, creditAmount: null },
    ] as any

    const result = calculateRunningBalances(entries)

    expect(result[0].runningBalance).toBe(100)
  })

  it('should calculate running balance for multiple entries', () => {
    const entries = [
      { id: '1', debitAmount: 100, creditAmount: null },
      { id: '2', debitAmount: null, creditAmount: 30 },
      { id: '3', debitAmount: 50, creditAmount: null },
    ] as any

    const result = calculateRunningBalances(entries)

    expect(result[0].runningBalance).toBe(100)     // 0 + 100 = 100
    expect(result[1].runningBalance).toBe(70)      // 100 - 30 = 70
    expect(result[2].runningBalance).toBe(120)     // 70 + 50 = 120
  })

  it('should use opening balance', () => {
    const entries = [
      { id: '1', debitAmount: 100, creditAmount: null },
    ] as any

    const result = calculateRunningBalances(entries, 500)

    expect(result[0].runningBalance).toBe(600) // 500 + 100 = 600
  })

  it('should handle null amounts as zero', () => {
    const entries = [
      { id: '1', debitAmount: null, creditAmount: null },
    ] as any

    const result = calculateRunningBalances(entries, 100)

    expect(result[0].runningBalance).toBe(100)
  })

  it('should preserve original entry properties', () => {
    const entries = [
      { id: '1', description: 'Test', debitAmount: 100, creditAmount: null },
    ] as any

    const result = calculateRunningBalances(entries)

    expect(result[0].id).toBe('1')
    expect(result[0].description).toBe('Test')
  })
})

describe('calculateTotals', () => {
  it('should return zeros for empty array', () => {
    const result = calculateTotals([])

    expect(result.totalDebits).toBe(0)
    expect(result.totalCredits).toBe(0)
    expect(result.netMovement).toBe(0)
  })

  it('should calculate totals for single entry', () => {
    const entries = [
      { debitAmount: 100, creditAmount: null },
    ] as any

    const result = calculateTotals(entries)

    expect(result.totalDebits).toBe(100)
    expect(result.totalCredits).toBe(0)
    expect(result.netMovement).toBe(100)
  })

  it('should sum all debits and credits', () => {
    const entries = [
      { debitAmount: 100, creditAmount: null },
      { debitAmount: 50, creditAmount: null },
      { debitAmount: null, creditAmount: 30 },
      { debitAmount: null, creditAmount: 20 },
    ] as any

    const result = calculateTotals(entries)

    expect(result.totalDebits).toBe(150)
    expect(result.totalCredits).toBe(50)
    expect(result.netMovement).toBe(100) // 150 - 50
  })

  it('should handle mixed entries', () => {
    const entries = [
      { debitAmount: 100, creditAmount: 50 },  // Both in same entry
    ] as any

    const result = calculateTotals(entries)

    expect(result.totalDebits).toBe(100)
    expect(result.totalCredits).toBe(50)
    expect(result.netMovement).toBe(50)
  })

  it('should handle negative net movement', () => {
    const entries = [
      { debitAmount: 50, creditAmount: null },
      { debitAmount: null, creditAmount: 100 },
    ] as any

    const result = calculateTotals(entries)

    expect(result.netMovement).toBe(-50)
  })
})

describe('generateClosureDescription', () => {
  const testDate = new Date('2024-03-15')

  it('should generate revenue description', () => {
    const result = generateClosureDescription('revenue', testDate)
    expect(result).toBe('Incasso giornaliero contanti 15/03/2024')
  })

  it('should generate POS description', () => {
    const result = generateClosureDescription('pos', testDate)
    expect(result).toBe('Incasso giornaliero POS 15/03/2024')
  })

  it('should generate deposit description', () => {
    const result = generateClosureDescription('deposit', testDate)
    expect(result).toBe('Versamento in banca 15/03/2024')
  })

  it('should generate basic expense description', () => {
    const result = generateClosureDescription('expense', testDate)
    expect(result).toBe('Uscita 15/03/2024')
  })

  it('should generate expense description with string detail', () => {
    const result = generateClosureDescription('expense', testDate, 'Caffè')
    expect(result).toBe('Uscita: Caffè (15/03/2024)')
  })

  it('should generate expense description with ExpenseDetail object', () => {
    const detail = {
      payee: 'Fornitore ABC',
      description: 'Latte',
      documentRef: 'FT-123',
    }
    const result = generateClosureDescription('expense', testDate, detail)
    expect(result).toBe('Fornitore ABC - Latte - Rif. FT-123 (15/03/2024)')
  })

  it('should handle partial ExpenseDetail', () => {
    const result = generateClosureDescription('expense', testDate, {
      payee: 'Fornitore',
    })
    expect(result).toBe('Fornitore (15/03/2024)')
  })

  it('should handle ExpenseDetail with only description', () => {
    const result = generateClosureDescription('expense', testDate, {
      description: 'Materiale pulizia',
    })
    expect(result).toBe('Materiale pulizia (15/03/2024)')
  })

  it('should handle empty ExpenseDetail', () => {
    const result = generateClosureDescription('expense', testDate, {})
    expect(result).toBe('Uscita 15/03/2024')
  })
})

describe('formatSignedAmount', () => {
  it('should format debit as positive', () => {
    const result = formatSignedAmount(100, null)

    expect(result.value).toBe(100)
    expect(result.sign).toBe('+')
    expect(result.formatted).toContain('+')
    expect(result.formatted).toContain('100')
  })

  it('should format credit as negative', () => {
    const result = formatSignedAmount(null, 50)

    expect(result.value).toBe(50)
    expect(result.sign).toBe('-')
    expect(result.formatted).toContain('-')
    expect(result.formatted).toContain('50')
  })

  it('should return zero for null amounts', () => {
    const result = formatSignedAmount(null, null)

    expect(result.value).toBe(0)
    expect(result.sign).toBe('+')
  })

  it('should return zero for undefined amounts', () => {
    const result = formatSignedAmount(undefined, undefined)

    expect(result.value).toBe(0)
    expect(result.sign).toBe('+')
  })

  it('should prefer debit over credit when both provided', () => {
    const result = formatSignedAmount(100, 50)

    expect(result.value).toBe(100)
    expect(result.sign).toBe('+')
  })

  it('should handle zero debit', () => {
    const result = formatSignedAmount(0, 100)

    expect(result.value).toBe(100)
    expect(result.sign).toBe('-')
  })
})

describe('isEntryEditable', () => {
  it('should return true for entry without closureId', () => {
    const entry = { id: '1', closureId: null } as any
    expect(isEntryEditable(entry)).toBe(true)
  })

  it('should return true for entry with undefined closureId', () => {
    const entry = { id: '1' } as any
    expect(isEntryEditable(entry)).toBe(true)
  })

  it('should return false for entry with closureId', () => {
    const entry = { id: '1', closureId: 'closure-123' } as any
    expect(isEntryEditable(entry)).toBe(false)
  })
})

describe('groupEntriesByDate', () => {
  it('should return empty map for empty array', () => {
    const result = groupEntriesByDate([])
    expect(result.size).toBe(0)
  })

  it('should group single entry', () => {
    const entries = [
      { id: '1', date: new Date('2024-03-15T10:00:00') },
    ] as any

    const result = groupEntriesByDate(entries)

    expect(result.size).toBe(1)
    expect(result.get('2024-03-15')).toHaveLength(1)
  })

  it('should group multiple entries by date', () => {
    const entries = [
      { id: '1', date: new Date('2024-03-15T10:00:00') },
      { id: '2', date: new Date('2024-03-15T14:00:00') },
      { id: '3', date: new Date('2024-03-16T09:00:00') },
    ] as any

    const result = groupEntriesByDate(entries)

    expect(result.size).toBe(2)
    expect(result.get('2024-03-15')).toHaveLength(2)
    expect(result.get('2024-03-16')).toHaveLength(1)
  })

  it('should handle string dates', () => {
    const entries = [
      { id: '1', date: '2024-03-15' },
    ] as any

    const result = groupEntriesByDate(entries)

    expect(result.size).toBe(1)
    expect(result.get('2024-03-15')).toHaveLength(1)
  })

  it('should preserve entry order within date', () => {
    const entries = [
      { id: '1', date: new Date('2024-03-15T10:00:00') },
      { id: '2', date: new Date('2024-03-15T14:00:00') },
    ] as any

    const result = groupEntriesByDate(entries)
    const dateEntries = result.get('2024-03-15')!

    expect(dateEntries[0].id).toBe('1')
    expect(dateEntries[1].id).toBe('2')
  })
})
