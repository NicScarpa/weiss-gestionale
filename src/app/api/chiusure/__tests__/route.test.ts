import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { DailyClosure } from '@prisma/client'
import { GET, POST } from '../route'
import {
  createTestClosure,
  createMinimalClosure,
  createCompleteClosure,
  createMockDbClosure,
  createMockSession,
  createInvalidClosure,
  TestClosureData,
} from '@/test/factories/closure.factory'

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// Il rate limiting usa uno store in-memory condiviso: senza mock scatterebbe
// dopo poche richieste nella stessa suite, facendo fallire i test con 429
vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils')
  return {
    ...actual,
    checkRequestRateLimit: vi.fn(() => ({
      allowed: true,
      result: { success: true, remaining: 99, reset: Date.now() + 60_000, limit: 100 },
    })),
  }
})

// Mock della sede: dopo la remediation anti-IDOR le route non leggono più
// il venueId dal client, lo risolvono da getVenueId() (installazione single-venue)
vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
  getVenue: vi.fn().mockResolvedValue({ id: 'venue-test-123', name: 'Weiss Test' }),
}))

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyClosure: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// `authDiRoute` è `auth` ristretta alla firma senza argomenti che le route
// chiamano: senza, `vi.mocked` sceglie l'overload da middleware e ogni
// `mockResolvedValue(sessione)` è un errore di tipo. Vedi il file per esteso.
import { authDiRoute } from '@/test/auth-unitari'
import { prisma } from '@/lib/prisma'

describe('GET /api/chiusure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 if not authenticated', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/chiusure')
      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Non autorizzato')
    })

    it('should return 401 if session has no user', async () => {
      vi.mocked(authDiRoute).mockResolvedValue({ user: null } as unknown as Session)

      const request = new NextRequest('http://localhost:3000/api/chiusure')
      const response = await GET(request)

      expect(response.status).toBe(401)
    })
  })

  describe('Successful Responses', () => {
    it('should return empty list when no closures exist', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findMany).mockResolvedValue([])
      vi.mocked(prisma.dailyClosure.count).mockResolvedValue(0)

      const request = new NextRequest('http://localhost:3000/api/chiusure')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data).toEqual([])
      expect(data.pagination.total).toBe(0)
    })

    it('should return closures with pagination', async () => {
      const mockSession = createMockSession()
      vi.mocked(authDiRoute).mockResolvedValue(mockSession)

      const mockClosure = {
        id: 'closure-1',
        date: new Date('2024-03-15'),
        status: 'DRAFT',
        venueId: 'venue-test-123',
        isEvent: false,
        eventName: null,
        submittedAt: null,
        validatedAt: null,
        createdAt: new Date(),
        venue: { id: 'venue-test-123', name: 'Test Venue', code: 'TEST' },
        submittedBy: null,
        validatedBy: null,
        stations: [{ id: 'station-1', name: 'BAR', totalAmount: 500 }],
        expenses: [{ amount: 50 }],
        _count: { stations: 1, expenses: 1 },
      }

      vi.mocked(prisma.dailyClosure.findMany).mockResolvedValue([mockClosure] as unknown as DailyClosure[])
      vi.mocked(prisma.dailyClosure.count).mockResolvedValue(1)

      const request = new NextRequest('http://localhost:3000/api/chiusure')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data).toHaveLength(1)
      expect(data.data[0].id).toBe('closure-1')
      expect(data.data[0].grossTotal).toBe(550) // 500 sales + 50 expenses
      expect(data.pagination.page).toBe(1)
      expect(data.pagination.total).toBe(1)
    })

    it('should ignore the venueId query param and use the installation venue', async () => {
      // Remediation anti-IDOR: il venueId non è più preso dal client, così un
      // utente non può leggere le chiusure di un'altra sede passandolo in query
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession({ role: 'admin' }))
      vi.mocked(prisma.dailyClosure.findMany).mockResolvedValue([])
      vi.mocked(prisma.dailyClosure.count).mockResolvedValue(0)

      const request = new NextRequest(
        'http://localhost:3000/api/chiusure?venueId=venue-other'
      )
      await GET(request)

      expect(prisma.dailyClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            venueId: 'venue-test-123',
          }),
        })
      )
    })

    it('should filter by status', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findMany).mockResolvedValue([])
      vi.mocked(prisma.dailyClosure.count).mockResolvedValue(0)

      const request = new NextRequest(
        'http://localhost:3000/api/chiusure?status=VALIDATED'
      )
      await GET(request)

      expect(prisma.dailyClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'VALIDATED',
          }),
        })
      )
    })

    it('should filter by date range', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findMany).mockResolvedValue([])
      vi.mocked(prisma.dailyClosure.count).mockResolvedValue(0)

      const request = new NextRequest(
        'http://localhost:3000/api/chiusure?dateFrom=2024-01-01&dateTo=2024-03-31'
      )
      await GET(request)

      expect(prisma.dailyClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: new Date('2024-01-01'),
              lte: new Date('2024-03-31'),
            },
          }),
        })
      )
    })

    it('should respect pagination parameters', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findMany).mockResolvedValue([])
      vi.mocked(prisma.dailyClosure.count).mockResolvedValue(100)

      const request = new NextRequest(
        'http://localhost:3000/api/chiusure?page=3&limit=10'
      )
      const response = await GET(request)

      expect(prisma.dailyClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        })
      )

      const data = await response.json()
      expect(data.pagination.page).toBe(3)
      expect(data.pagination.limit).toBe(10)
      expect(data.pagination.totalPages).toBe(10)
    })

    it('should limit max page size to 100', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findMany).mockResolvedValue([])
      vi.mocked(prisma.dailyClosure.count).mockResolvedValue(0)

      const request = new NextRequest(
        'http://localhost:3000/api/chiusure?limit=500'
      )
      await GET(request)

      expect(prisma.dailyClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // Max limit
        })
      )
    })
  })
})

describe('POST /api/chiusure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 if not authenticated', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(null)

      const closureData = createTestClosure()
      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
    })
  })

  describe('Authorization', () => {
    it('should let staff create a closure', async () => {
      // Lo staff compila la chiusura a fine turno: è il flusso previsto dal
      // prodotto. Resta escluso dalla validazione, che genera le scritture.
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession({ role: 'staff' }))
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createTestClosure()
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(
        createMockDbClosure(closureData) as unknown as DailyClosure
      )

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    it('should override a foreign venueId in the body with the installation venue', async () => {
      // Remediation anti-IDOR: il venueId inviato dal client viene sempre
      // sovrascritto, quindi non è possibile creare una chiusura per un'altra sede
      vi.mocked(authDiRoute).mockResolvedValue(
        createMockSession({ role: 'manager', venueId: 'venue-altra' })
      )
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)
      const closureData = createTestClosure({ venueId: 'venue-other' })
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(
        createMockDbClosure(closureData) as unknown as DailyClosure
      )

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(prisma.dailyClosure.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ venueId: 'venue-test-123' }),
        })
      )
    })

    it('should allow admin to create closure for any venue', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession({ role: 'admin' }))
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createMinimalClosure({ venueId: 'any-venue' })
      const mockResult = createMockDbClosure(closureData as TestClosureData)
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)
    })
  })

  describe('Validation', () => {
    it('should return 400 for invalid data (missing required fields)', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())

      const invalidData = createInvalidClosure()
      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(invalidData),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Dati non validi')
      expect(data.details).toBeDefined()
    })

    it('should return 400 for empty venueId', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())

      const closureData = createMinimalClosure({ venueId: '' })
      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('should validate expense documentType enum', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())

      const closureData = createTestClosure({
        expenses: [
          {
            payee: 'Test',
            amount: 50,
            documentType: 'INVALID_TYPE' as unknown as 'NONE' | 'FATTURA' | 'DDT' | 'RICEVUTA' | 'PERSONALE',
          },
        ],
      })
      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('should return 400 for attendance with empty userId', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())

      const closureData = createTestClosure({
        attendance: [
          {
            userId: '',
            shift: 'MORNING',
            hours: 8,
          },
        ],
      })

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Dati non validi')
      expect(Array.isArray(data.details)).toBe(true)
      expect(data.details.some((d: { path?: unknown[] }) => Array.isArray(d.path) && d.path[0] === 'attendance')).toBe(true)
    })

    it('should return 400 for duplicate partial timeSlot', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())

      const closureData = createTestClosure({
        partials: [
          { timeSlot: '16:00', receiptProgressive: 0, posProgressive: 0 },
          { timeSlot: '16:00', receiptProgressive: 10, posProgressive: 5 },
        ],
      })

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Dati non validi')
      expect(Array.isArray(data.details)).toBe(true)
      expect(data.details.some((d: { path?: unknown[] }) => Array.isArray(d.path) && d.path[0] === 'partials')).toBe(true)
    })
  })

  describe('Conflict Detection', () => {
    it('should return 409 if closure already exists for date/venue', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())

      const existingClosure = { id: 'existing-closure-id' }
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(existingClosure as unknown as DailyClosure)

      const closureData = createTestClosure()
      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toContain('Esiste già una chiusura')
      expect(data.existingId).toBe('existing-closure-id')
    })
  })

  describe('Successful Creation', () => {
    it('should create minimal closure successfully', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createMinimalClosure()
      const mockResult = createMockDbClosure(closureData as TestClosureData)
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.id).toBeDefined()
      expect(data.status).toBe('DRAFT')
    })

    it('should create closure with stations', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createTestClosure()
      const mockResult = createMockDbClosure(closureData as TestClosureData)
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)

      // Verify create was called with stations
      expect(prisma.dailyClosure.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stations: expect.objectContaining({
              create: expect.any(Array),
            }),
          }),
        })
      )
    })

    it('should create complete closure with all relations', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createCompleteClosure()
      const mockResult = createMockDbClosure(closureData as TestClosureData)
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)

      // Verify all relations were created
      const createCall = vi.mocked(prisma.dailyClosure.create).mock.calls[0][0]
      expect(createCall.data.stations).toBeDefined()
      expect(createCall.data.expenses).toBeDefined()
      expect(createCall.data.attendance).toBeDefined()
    })

    it('should set default float amount to 114', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createTestClosure({
        stations: [
          {
            name: 'BAR',
            cashAmount: 100,
            posAmount: 50,
            // floatAmount not specified - should default to 114
          },
        ],
      })
      const mockResult = createMockDbClosure(closureData as TestClosureData)
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      await POST(request)

      const createCall = vi.mocked(prisma.dailyClosure.create).mock.calls[0][0]
      expect(createCall.data.stations?.create?.[0]?.floatAmount).toBe(114)
    })

    it('should calculate station totalAmount correctly', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createTestClosure({
        stations: [
          {
            name: 'BAR',
            cashAmount: 300,
            posAmount: 200,
            receiptAmount: 450,
          },
        ],
      })
      const mockResult = createMockDbClosure(closureData as TestClosureData)
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      await POST(request)

      const createCall = vi.mocked(prisma.dailyClosure.create).mock.calls[0][0]
      const stationData = createCall.data.stations?.create?.[0]
      expect(stationData?.totalAmount).toBe(500) // 300 + 200
      expect(stationData?.nonReceiptAmount).toBe(50) // 500 - 450
    })
  })

  describe('Event Closures', () => {
    it('should create event closure with eventName', async () => {
      vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
      vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

      const closureData = createTestClosure({
        isEvent: true,
        eventName: 'Concerto Estate 2024',
      })
      const mockResult = createMockDbClosure(closureData as TestClosureData)
      vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

      const request = new NextRequest('http://localhost:3000/api/chiusure', {
        method: 'POST',
        body: JSON.stringify(closureData),
      })
      await POST(request)

      const createCall = vi.mocked(prisma.dailyClosure.create).mock.calls[0][0]
      expect(createCall.data.isEvent).toBe(true)
      expect(createCall.data.eventName).toBe('Concerto Estate 2024')
    })
  })
})

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle database errors gracefully', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
    vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.dailyClosure.create).mockRejectedValue(new Error('Database error'))

    const closureData = createTestClosure()
    const request = new NextRequest('http://localhost:3000/api/chiusure', {
      method: 'POST',
      body: JSON.stringify(closureData),
    })
    const response = await POST(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toContain('Errore')
  })

  it('should handle malformed JSON', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(createMockSession())

    const request = new NextRequest('http://localhost:3000/api/chiusure', {
      method: 'POST',
      body: 'not valid json',
    })

    // This will throw a SyntaxError which should be caught
    const response = await POST(request)
    expect(response.status).toBe(500)
  })

  it('should parse ISO date strings correctly', async () => {
    vi.mocked(authDiRoute).mockResolvedValue(createMockSession())
    vi.mocked(prisma.dailyClosure.findFirst).mockResolvedValue(null)

    const testDate = '2024-03-15T00:00:00.000Z'
    const closureData = createMinimalClosure({ date: testDate })
    const mockResult = createMockDbClosure(closureData as TestClosureData)
    vi.mocked(prisma.dailyClosure.create).mockResolvedValue(mockResult as unknown as DailyClosure)

    const request = new NextRequest('http://localhost:3000/api/chiusure', {
      method: 'POST',
      body: JSON.stringify(closureData),
    })
    await POST(request)

    const createCall = vi.mocked(prisma.dailyClosure.create).mock.calls[0][0]
    expect(createCall.data.date).toEqual(new Date(testDate))
  })
})
