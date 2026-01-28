/**
 * Factory functions for creating test data for daily closures
 */

export interface TestStationData {
  name: string
  position?: number
  receiptAmount?: number
  receiptVat?: number
  invoiceAmount?: number
  invoiceVat?: number
  suspendedAmount?: number
  cashAmount?: number
  posAmount?: number
  floatAmount?: number
  cashCount?: TestCashCountData
}

export interface TestCashCountData {
  bills500?: number
  bills200?: number
  bills100?: number
  bills50?: number
  bills20?: number
  bills10?: number
  bills5?: number
  coins2?: number
  coins1?: number
  coins050?: number
  coins020?: number
  coins010?: number
  coins005?: number
  coins002?: number
  coins001?: number
}

export interface TestExpenseData {
  payee: string
  description?: string
  documentRef?: string
  documentType?: 'NONE' | 'FATTURA' | 'DDT' | 'RICEVUTA' | 'PERSONALE'
  amount: number
  vatAmount?: number
  accountId?: string
  isPaid?: boolean
  paidBy?: string
}

export interface TestAttendanceData {
  userId: string
  shift: 'MORNING' | 'EVENING'
  hours?: number
  statusCode?: string
  hourlyRate?: number
  notes?: string
}

export interface TestClosureData {
  date: string
  venueId: string
  isEvent?: boolean
  eventName?: string
  weatherMorning?: string
  weatherAfternoon?: string
  weatherEvening?: string
  notes?: string
  stations?: TestStationData[]
  partials?: TestPartialData[]
  expenses?: TestExpenseData[]
  attendance?: TestAttendanceData[]
}

export interface TestPartialData {
  timeSlot: string
  receiptProgressive?: number
  posProgressive?: number
  coffeeCounter?: number
  coffeeDelta?: number
  weather?: string
}

/**
 * Creates a test station with default values
 */
export function createTestStation(overrides?: Partial<TestStationData>): TestStationData {
  return {
    name: 'BAR',
    position: 0,
    receiptAmount: 500,
    receiptVat: 45.45,
    invoiceAmount: 0,
    invoiceVat: 0,
    suspendedAmount: 0,
    cashAmount: 300,
    posAmount: 200,
    floatAmount: 114,
    ...overrides,
  }
}

/**
 * Creates a test station with cash count
 */
export function createTestStationWithCashCount(
  stationOverrides?: Partial<TestStationData>,
  cashCountOverrides?: Partial<TestCashCountData>
): TestStationData {
  const defaultCashCount: TestCashCountData = {
    bills500: 0,
    bills200: 0,
    bills100: 2, // €200
    bills50: 1,  // €50
    bills20: 2,  // €40
    bills10: 1,  // €10
    bills5: 0,
    coins2: 5,   // €10
    coins1: 4,   // €4
    coins050: 0,
    coins020: 0,
    coins010: 0,
    coins005: 0,
    coins002: 0,
    coins001: 0,
    ...cashCountOverrides,
  }
  // Total: 200 + 50 + 40 + 10 + 10 + 4 = €314

  return {
    ...createTestStation(stationOverrides),
    cashCount: defaultCashCount,
  }
}

/**
 * Creates a test expense
 */
export function createTestExpense(overrides?: Partial<TestExpenseData>): TestExpenseData {
  return {
    payee: 'Fornitore Test',
    description: 'Merce bar',
    documentRef: 'FT-2024-001',
    documentType: 'FATTURA',
    amount: 50,
    vatAmount: 4.55,
    isPaid: true,
    ...overrides,
  }
}

/**
 * Creates a test attendance record
 */
export function createTestAttendance(overrides?: Partial<TestAttendanceData>): TestAttendanceData {
  return {
    userId: 'user-test-123',
    shift: 'MORNING',
    hours: 8,
    hourlyRate: 10,
    ...overrides,
  }
}

/**
 * Creates a complete test closure payload
 */
export function createTestClosure(overrides?: Partial<TestClosureData>): TestClosureData {
  return {
    date: new Date().toISOString(),
    venueId: 'venue-test-123',
    isEvent: false,
    weatherMorning: 'SERENO',
    weatherAfternoon: 'SERENO',
    weatherEvening: 'NUVOLOSO',
    notes: 'Chiusura test',
    stations: [createTestStation()],
    partials: [],
    expenses: [],
    attendance: [],
    ...overrides,
  }
}

/**
 * Creates a minimal valid closure (only required fields)
 */
export function createMinimalClosure(overrides?: Partial<TestClosureData>): TestClosureData {
  return {
    date: new Date().toISOString(),
    venueId: 'venue-test-123',
    ...overrides,
  }
}

/**
 * Creates a closure for an event
 */
export function createEventClosure(
  eventName: string,
  overrides?: Partial<TestClosureData>
): TestClosureData {
  return {
    ...createTestClosure(),
    isEvent: true,
    eventName,
    stations: [
      createTestStation({ name: 'BAR', position: 0 }),
      createTestStation({ name: 'CASSA 1', position: 1 }),
      createTestStation({ name: 'CASSA 2', position: 2 }),
    ],
    ...overrides,
  }
}

/**
 * Creates a closure with all components
 */
export function createCompleteClosure(overrides?: Partial<TestClosureData>): TestClosureData {
  return {
    ...createTestClosure(),
    stations: [
      createTestStationWithCashCount({ name: 'BAR', cashAmount: 400, posAmount: 200 }),
      createTestStation({ name: 'CASSA 1', cashAmount: 150, posAmount: 100 }),
    ],
    expenses: [
      createTestExpense({ payee: 'Fornitore A', amount: 30 }),
      createTestExpense({ payee: 'Fornitore B', amount: 20, documentType: 'DDT' }),
    ],
    attendance: [
      createTestAttendance({ userId: 'user-1', shift: 'MORNING' }),
      createTestAttendance({ userId: 'user-2', shift: 'EVENING' }),
    ],
    ...overrides,
  }
}

/**
 * Creates an invalid closure (missing required fields)
 */
export function createInvalidClosure(): Partial<TestClosureData> {
  return {
    // Missing date and venueId
    isEvent: false,
    notes: 'Invalid closure',
  }
}

/**
 * Creates a mock database closure result
 */
export function createMockDbClosure(input: TestClosureData, id = 'closure-mock-123') {
  const _totalAmount = (input.stations || []).reduce(
    (sum, s) => sum + (s.cashAmount || 0) + (s.posAmount || 0),
    0
  )

  return {
    id,
    venueId: input.venueId,
    date: new Date(input.date),
    status: 'DRAFT',
    isEvent: input.isEvent || false,
    eventName: input.eventName || null,
    weatherMorning: input.weatherMorning || null,
    weatherAfternoon: input.weatherAfternoon || null,
    weatherEvening: input.weatherEvening || null,
    notes: input.notes || null,
    submittedAt: null,
    submittedById: null,
    validatedAt: null,
    validatedById: null,
    bankDeposit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    venue: {
      id: input.venueId,
      name: 'Test Venue',
      code: 'TEST',
    },
    stations: (input.stations || []).map((s, index) => ({
      id: `station-${index}`,
      closureId: id,
      name: s.name,
      position: s.position ?? index,
      receiptAmount: s.receiptAmount || 0,
      receiptVat: s.receiptVat || 0,
      invoiceAmount: s.invoiceAmount || 0,
      invoiceVat: s.invoiceVat || 0,
      suspendedAmount: s.suspendedAmount || 0,
      cashAmount: s.cashAmount || 0,
      posAmount: s.posAmount || 0,
      totalAmount: (s.cashAmount || 0) + (s.posAmount || 0),
      nonReceiptAmount: (s.cashAmount || 0) + (s.posAmount || 0) - (s.receiptAmount || 0),
      floatAmount: s.floatAmount || 114,
    })),
    _count: {
      stations: (input.stations || []).length,
      expenses: (input.expenses || []).length,
      attendance: (input.attendance || []).length,
    },
  }
}

/**
 * Creates a mock user session
 */
export function createMockSession(overrides?: {
  userId?: string
  role?: 'admin' | 'manager' | 'staff'
  venueId?: string
}) {
  return {
    user: {
      id: overrides?.userId || 'user-test-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: overrides?.role || 'manager',
      venueId: overrides?.venueId || 'venue-test-123',
    },
  }
}
