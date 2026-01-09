import { describe, it, expect } from 'vitest'
import {
  buildClosurePayload,
  buildClosureUpdatePayload,
} from '../closure-form-utils'
import { ClosureFormData } from '@/components/chiusura/ClosureForm'

// Helper to create minimal valid form data
function createFormData(overrides?: Partial<ClosureFormData>): ClosureFormData {
  return {
    date: new Date('2024-03-15'),
    venueId: 'venue-123',
    isEvent: false,
    stations: [],
    partials: [],
    expenses: [],
    attendance: [],
    ...overrides,
  }
}

describe('buildClosurePayload', () => {
  describe('Basic Fields', () => {
    it('should convert date to ISO string', () => {
      const testDate = new Date('2024-03-15T10:30:00.000Z')
      const data = createFormData({
        date: testDate,
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.date).toBe(testDate.toISOString())
    })

    it('should use provided venueId', () => {
      const data = createFormData()

      const result = buildClosurePayload(data, 'test-venue-id')

      expect(result.venueId).toBe('test-venue-id')
    })

    it('should preserve isEvent flag', () => {
      const data = createFormData({ isEvent: true })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.isEvent).toBe(true)
    })

    it('should preserve optional event name', () => {
      const data = createFormData({
        isEvent: true,
        eventName: 'Festa di Natale',
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.eventName).toBe('Festa di Natale')
    })

    it('should preserve weather fields', () => {
      const data = createFormData({
        weatherMorning: 'sunny',
        weatherAfternoon: 'cloudy',
        weatherEvening: 'rainy',
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.weatherMorning).toBe('sunny')
      expect(result.weatherAfternoon).toBe('cloudy')
      expect(result.weatherEvening).toBe('rainy')
    })

    it('should preserve notes', () => {
      const data = createFormData({
        notes: 'Giornata tranquilla',
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.notes).toBe('Giornata tranquilla')
    })
  })

  describe('Stations Mapping', () => {
    it('should map empty stations array', () => {
      const data = createFormData({ stations: [] })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.stations).toEqual([])
    })

    it('should map station with all fields', () => {
      const data = createFormData({
        stations: [
          {
            name: 'BAR',
            position: 0,
            receiptAmount: 500,
            receiptVat: 45.45,
            invoiceAmount: 100,
            invoiceVat: 9.09,
            suspendedAmount: 50,
            cashAmount: 300,
            posAmount: 200,
            floatAmount: 114,
            cashCount: {
              bills100: 2,
              bills50: 1,
              bills20: 2,
              bills10: 1,
              bills5: 0,
              coins2: 5,
              coins1: 4,
              coins050: 0,
              coins020: 0,
              coins010: 0,
              coins005: 0,
              coins002: 0,
              coins001: 0,
            },
          },
        ],
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.stations).toHaveLength(1)
      expect(result.stations[0].name).toBe('BAR')
      expect(result.stations[0].position).toBe(0)
      expect(result.stations[0].receiptAmount).toBe(500)
      expect(result.stations[0].cashAmount).toBe(300)
      expect(result.stations[0].posAmount).toBe(200)
      expect(result.stations[0].floatAmount).toBe(114)
      expect(result.stations[0].cashCount?.bills100).toBe(2)
    })

    it('should map multiple stations', () => {
      const data = createFormData({
        stations: [
          { name: 'BAR', position: 0, cashAmount: 100, posAmount: 50 } as any,
          { name: 'CASSA 1', position: 1, cashAmount: 200, posAmount: 75 } as any,
        ],
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.stations).toHaveLength(2)
      expect(result.stations[0].name).toBe('BAR')
      expect(result.stations[1].name).toBe('CASSA 1')
    })
  })

  describe('Partials Mapping', () => {
    it('should map empty partials array', () => {
      const data = createFormData({ partials: [] })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.partials).toEqual([])
    })

    it('should map partial with all fields', () => {
      const data = createFormData({
        partials: [
          {
            timeSlot: '10:00',
            receiptProgressive: 1500,
            posProgressive: 800,
            coffeeCounter: 250,
            coffeeDelta: 45,
          },
        ],
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.partials).toHaveLength(1)
      expect(result.partials[0].timeSlot).toBe('10:00')
      expect(result.partials[0].receiptProgressive).toBe(1500)
      expect(result.partials[0].coffeeCounter).toBe(250)
    })
  })

  describe('Expenses Mapping', () => {
    it('should map empty expenses array', () => {
      const data = createFormData({ expenses: [] })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.expenses).toEqual([])
    })

    it('should map expense with all fields', () => {
      const data = createFormData({
        expenses: [
          {
            payee: 'Fornitore ABC',
            documentRef: 'FT-2024-001',
            documentType: 'FATTURA',
            amount: 150,
            vatAmount: 13.64,
            accountId: 'acc-123',
            paidBy: 'Mario Rossi',
          },
        ],
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.expenses).toHaveLength(1)
      expect(result.expenses[0].payee).toBe('Fornitore ABC')
      expect(result.expenses[0].documentRef).toBe('FT-2024-001')
      expect(result.expenses[0].documentType).toBe('FATTURA')
      expect(result.expenses[0].amount).toBe(150)
      expect(result.expenses[0].vatAmount).toBe(13.64)
      expect(result.expenses[0].accountId).toBe('acc-123')
      expect(result.expenses[0].paidBy).toBe('Mario Rossi')
    })

    it('should map multiple expenses', () => {
      const data = createFormData({
        expenses: [
          { payee: 'Fornitore A', amount: 50 } as any,
          { payee: 'Fornitore B', amount: 75 } as any,
        ],
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.expenses).toHaveLength(2)
    })
  })

  describe('Attendance Mapping', () => {
    it('should map empty attendance array', () => {
      const data = createFormData({ attendance: [] })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.attendance).toEqual([])
    })

    it('should map attendance with all fields', () => {
      const data = createFormData({
        attendance: [
          {
            userId: 'user-123',
            shift: 'MORNING',
            hours: 8,
            statusCode: 'P',
            hourlyRate: 12.5,
            notes: 'Turno regolare',
          },
        ],
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.attendance).toHaveLength(1)
      expect(result.attendance[0].userId).toBe('user-123')
      expect(result.attendance[0].shift).toBe('MORNING')
      expect(result.attendance[0].hours).toBe(8)
      expect(result.attendance[0].statusCode).toBe('P')
      expect(result.attendance[0].hourlyRate).toBe(12.5)
      expect(result.attendance[0].notes).toBe('Turno regolare')
    })

    it('should handle EVENING shift', () => {
      const data = createFormData({
        attendance: [
          {
            userId: 'user-456',
            shift: 'EVENING',
            hours: 6,
          },
        ],
      })

      const result = buildClosurePayload(data, 'venue-123')

      expect(result.attendance[0].shift).toBe('EVENING')
    })
  })

  describe('Complete Payload', () => {
    it('should build complete payload with all sections', () => {
      const data = createFormData({
        isEvent: true,
        eventName: 'Concerto',
        weatherMorning: 'sunny',
        notes: 'Evento speciale',
        stations: [
          { name: 'BAR', position: 0, cashAmount: 500, posAmount: 300 } as any,
        ],
        partials: [
          { timeSlot: '18:00', receiptProgressive: 2000 } as any,
        ],
        expenses: [
          { payee: 'Audio Service', amount: 200 } as any,
        ],
        attendance: [
          { userId: 'user-1', shift: 'EVENING' as const, hours: 8 },
        ],
      })

      const result = buildClosurePayload(data, 'venue-event')

      expect(result.venueId).toBe('venue-event')
      expect(result.isEvent).toBe(true)
      expect(result.eventName).toBe('Concerto')
      expect(result.stations).toHaveLength(1)
      expect(result.partials).toHaveLength(1)
      expect(result.expenses).toHaveLength(1)
      expect(result.attendance).toHaveLength(1)
    })
  })
})

describe('buildClosureUpdatePayload', () => {
  it('should return only metadata fields', () => {
    const data = createFormData({
      isEvent: true,
      eventName: 'Updated Event',
      weatherMorning: 'cloudy',
      weatherAfternoon: 'rainy',
      weatherEvening: 'sunny',
      notes: 'Updated notes',
      stations: [{ name: 'BAR', cashAmount: 100 } as any],
      expenses: [{ payee: 'Test', amount: 50 } as any],
    })

    const result = buildClosureUpdatePayload(data)

    // Should include metadata
    expect(result.date).toBeDefined()
    expect(result.isEvent).toBe(true)
    expect(result.eventName).toBe('Updated Event')
    expect(result.weatherMorning).toBe('cloudy')
    expect(result.weatherAfternoon).toBe('rainy')
    expect(result.weatherEvening).toBe('sunny')
    expect(result.notes).toBe('Updated notes')

    // Should NOT include relations
    expect(result).not.toHaveProperty('stations')
    expect(result).not.toHaveProperty('expenses')
    expect(result).not.toHaveProperty('partials')
    expect(result).not.toHaveProperty('attendance')
    expect(result).not.toHaveProperty('venueId')
  })

  it('should format date as YYYY-MM-DD', () => {
    const data = createFormData({
      date: new Date('2024-03-15T14:30:00'),
    })

    const result = buildClosureUpdatePayload(data)

    expect(result.date).toBe('2024-03-15')
  })

  it('should handle undefined optional fields', () => {
    const data = createFormData({
      eventName: undefined,
      notes: undefined,
    })

    const result = buildClosureUpdatePayload(data)

    expect(result.eventName).toBeUndefined()
    expect(result.notes).toBeUndefined()
  })
})
