import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateJournalEntriesFromClosure, deleteJournalEntriesForClosure } from '../closure-journal-entries'

// Mock prisma
vi.mock('../prisma', () => ({
  prisma: {
    journalEntry: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}))

// Import the mocked prisma after mocking
import { prisma } from '../prisma'

describe('generateJournalEntriesFromClosure', () => {
  const userId = 'user-123'
  const baseDate = new Date('2024-03-15')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Entry Generation Logic', () => {
    it('should generate cash income entry for cash sales', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: 500,
            creditAmount: null,
          }),
        ]),
      })

      expect(result.entriesCreated).toBeGreaterThan(0)
      expect(result.totalDebits).toBe(500)
    })

    it('should generate POS income entry on BANK register', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 0, posAmount: 300, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'BANK',
            debitAmount: 300,
            creditAmount: null,
          }),
        ]),
      })

      expect(result.totalDebits).toBe(300)
    })

    it('should generate expense entries as credits', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 30, payee: 'Fornitore A', description: 'Caffè', documentRef: null, accountId: null },
          { amount: 20, payee: 'Fornitore B', description: null, documentRef: 'FT-123', accountId: 'acc-1' },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Should have expense credits
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: null,
            creditAmount: 30,
          }),
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: null,
            creditAmount: 20,
            accountId: 'acc-1',
          }),
        ]),
      })

      expect(result.totalCredits).toBe(50)
    })

    it('should add expenses to cash income (cash income = sales + expenses paid)', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 50, payee: 'Test', description: null, documentRef: null, accountId: null },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Cash income should be 500 (cash sales) + 50 (expenses paid) = 550
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: 550, // Cash sales + expenses
            creditAmount: null,
          }),
        ]),
      })
    })

    it('should generate bank deposit entries (cash out + bank in)', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: 400,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Should have cash credit (money out of cash)
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: null,
            creditAmount: 400,
          }),
        ]),
      })

      // Should have bank debit (money into bank)
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'BANK',
            debitAmount: 400,
            creditAmount: null,
          }),
        ]),
      })

      // Bank deposit appears twice: credit from cash, debit to bank
      expect(result.totalCredits).toBe(400)
      expect(result.totalDebits).toBeGreaterThanOrEqual(400)
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle complete closure with all components', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: 300,
        stations: [
          { cashAmount: 400, posAmount: 200, floatAmount: 114 },
          { cashAmount: 150, posAmount: 100, floatAmount: 114 },
        ],
        expenses: [
          { amount: 50, payee: 'Fornitore', description: 'Merce', documentRef: null, accountId: null },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Total cash from stations: 400 + 150 = 550
      // Total POS from stations: 200 + 100 = 300
      // Cash income = cash sales + expenses = 550 + 50 = 600

      // Entries expected:
      // 1. Cash income (CASH DEBIT) = 600
      // 2. Expense (CASH CREDIT) = 50
      // 3. POS (BANK DEBIT) = 300
      // 4. Deposit cash out (CASH CREDIT) = 300
      // 5. Deposit bank in (BANK DEBIT) = 300

      expect(result.entriesCreated).toBe(5)
      expect(result.totalDebits).toBe(600 + 300 + 300) // Cash + POS + Deposit to bank
      expect(result.totalCredits).toBe(50 + 300) // Expense + Deposit from cash
    })

    it('should handle closure with no activity', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 0, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).not.toHaveBeenCalled()
      expect(result.entriesCreated).toBe(0)
      expect(result.totalDebits).toBe(0)
      expect(result.totalCredits).toBe(0)
    })

    it('should handle closure with only POS sales', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 0, posAmount: 500, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Only POS entry on BANK
      expect(result.entriesCreated).toBe(1)
      expect(result.totalDebits).toBe(500)
      expect(result.totalCredits).toBe(0)
    })

    it('should handle closure with only expenses (returns, etc)', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 100, payee: 'Test', description: 'Expense', documentRef: null, accountId: null },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Cash income = 100 (sales) + 100 (expenses) = 200
      // Expense credit = 100
      expect(result.totalDebits).toBe(200)
      expect(result.totalCredits).toBe(100)
    })
  })

  describe('Edge Cases', () => {
    it('should handle null/undefined amounts', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: null, posAmount: undefined, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(result.entriesCreated).toBe(0)
      expect(result.totalDebits).toBe(0)
    })

    it('should skip zero-amount expenses', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 0, payee: 'Zero', description: null, documentRef: null, accountId: null },
          { amount: 50, payee: 'Valid', description: null, documentRef: null, accountId: null },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Only the valid expense should create a credit entry
      // Plus cash income entry
      expect(result.totalCredits).toBe(50)
    })

    it('should handle multiple stations', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 50, floatAmount: 114 },
          { cashAmount: 200, posAmount: 75, floatAmount: 114 },
          { cashAmount: 150, posAmount: 25, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Total cash: 100 + 200 + 150 = 450
      // Total POS: 50 + 75 + 25 = 150
      expect(result.totalDebits).toBe(450 + 150)
    })

    it('should preserve closureId on all entries', async () => {
      const closureId = 'closure-special-123'
      const closure = {
        id: closureId,
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            closureId: closureId,
          }),
        ]),
      })
    })

    it('should preserve createdById on all entries', async () => {
      const testUserId = 'special-user-456'
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      await generateJournalEntriesFromClosure(closure, testUserId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            createdById: testUserId,
          }),
        ]),
      })
    })
  })
})

describe('deleteJournalEntriesForClosure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete entries by closureId', async () => {
    const closureId = 'closure-to-delete'

    vi.mocked(prisma.journalEntry.deleteMany).mockResolvedValue({ count: 5 })

    const result = await deleteJournalEntriesForClosure(closureId)

    expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
      where: { closureId },
    })
    expect(result).toBe(5)
  })

  it('should return 0 when no entries found', async () => {
    vi.mocked(prisma.journalEntry.deleteMany).mockResolvedValue({ count: 0 })

    const result = await deleteJournalEntriesForClosure('non-existent')

    expect(result).toBe(0)
  })
})
