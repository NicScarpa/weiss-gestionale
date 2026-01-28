import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import type { Session } from 'next-auth'
import {
  errorResponse,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
  ok,
  created,
  isZodError,
  handleApiError,
  requireAuth,
  requireRole,
  requireVenueAccess,
  parsePagination,
  paginatedResponse,
  HttpStatus,
} from '../api-utils'

// Mock console.error for testing
vi.spyOn(console, 'error').mockImplementation(() => {})

describe('api-utils', () => {
  describe('Error Response Builders', () => {
    it('errorResponse should create correct error response', async () => {
      const response = errorResponse('Test error', 400, ['detail1'], 'ERR_CODE')
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Test error')
      expect(body.details).toEqual(['detail1'])
      expect(body.code).toBe('ERR_CODE')
    })

    it('badRequest should return 400 status', async () => {
      const response = badRequest('Invalid data')
      const body = await response.json()

      expect(response.status).toBe(HttpStatus.BAD_REQUEST)
      expect(body.error).toBe('Invalid data')
    })

    it('badRequest should include details when provided', async () => {
      const zodIssues = [{ code: 'invalid_type', message: 'Expected string' }]
      const response = badRequest('Dati non validi', zodIssues as unknown as z.ZodIssue[])
      const body = await response.json()

      expect(body.details).toEqual(zodIssues)
    })

    it('unauthorized should return 401 with default message', async () => {
      const response = unauthorized()
      const body = await response.json()

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED)
      expect(body.error).toBe('Non autorizzato')
    })

    it('unauthorized should return 401 with custom message', async () => {
      const response = unauthorized('Custom message')
      const body = await response.json()

      expect(body.error).toBe('Custom message')
    })

    it('forbidden should return 403 with default message', async () => {
      const response = forbidden()
      const body = await response.json()

      expect(response.status).toBe(HttpStatus.FORBIDDEN)
      expect(body.error).toBe('Accesso negato')
    })

    it('notFound should return 404 with default message', async () => {
      const response = notFound()
      const body = await response.json()

      expect(response.status).toBe(HttpStatus.NOT_FOUND)
      expect(body.error).toBe('Risorsa non trovata')
    })

    it('conflict should return 409 with existingId', async () => {
      const response = conflict('Already exists', 'existing-123')
      const body = await response.json()

      expect(response.status).toBe(HttpStatus.CONFLICT)
      expect(body.error).toBe('Already exists')
      expect(body.existingId).toBe('existing-123')
    })

    it('internalError should return 500 with default message', async () => {
      const response = internalError()
      const body = await response.json()

      expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
      expect(body.error).toBe('Errore interno del server')
    })
  })

  describe('Success Response Builders', () => {
    it('ok should return 200 with data', async () => {
      const data = { id: '123', name: 'Test' }
      const response = ok(data)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual(data)
    })

    it('created should return 201 with data', async () => {
      const data = { id: '123', name: 'New Item' }
      const response = created(data)
      const body = await response.json()

      expect(response.status).toBe(HttpStatus.CREATED)
      expect(body).toEqual(data)
    })
  })

  describe('isZodError', () => {
    it('should return true for ZodError', () => {
      const schema = z.object({ name: z.string() })
      try {
        schema.parse({ name: 123 })
      } catch (error) {
        expect(isZodError(error)).toBe(true)
      }
    })

    it('should return false for regular Error', () => {
      expect(isZodError(new Error('test'))).toBe(false)
    })

    it('should return false for non-error values', () => {
      expect(isZodError('string')).toBe(false)
      expect(isZodError(null)).toBe(false)
      expect(isZodError(undefined)).toBe(false)
    })
  })

  describe('handleApiError', () => {
    it('should return 400 for ZodError', async () => {
      const schema = z.object({ name: z.string() })
      let zodError: z.ZodError | null = null
      try {
        schema.parse({ name: 123 })
      } catch (error) {
        zodError = error as z.ZodError
      }

      const response = handleApiError(zodError, 'POST /test')
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Dati non validi')
      expect(body.details).toBeDefined()
    })

    it('should return 500 for generic error', async () => {
      const response = handleApiError(new Error('DB connection failed'), 'GET /test')
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Errore interno')
    })

    it('should use custom default message', async () => {
      const response = handleApiError(new Error('test'), 'GET /test', 'Errore personalizzato')
      const body = await response.json()

      expect(body.error).toBe('Errore personalizzato')
    })

    it('should log error to console', () => {
      handleApiError(new Error('test'), 'GET /test')
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('Auth Check Helpers', () => {
    const mockSession = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'staff',
        venueId: 'venue-123',
      },
      expires: '2099-01-01',
    }

    const mockAdminSession = {
      user: {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
        venueId: 'venue-456',
      },
      expires: '2099-01-01',
    }

    describe('requireAuth', () => {
      it('should return unauthorized for null session', () => {
        const result = requireAuth(null)
        expect(result.authorized).toBe(false)
        expect(result.response?.status).toBe(401)
      })

      it('should return unauthorized for session without user', () => {
        const result = requireAuth({ expires: '2099-01-01' } as unknown as Session)
        expect(result.authorized).toBe(false)
      })

      it('should return authorized for valid session', () => {
        const result = requireAuth(mockSession as unknown as Session)
        expect(result.authorized).toBe(true)
        expect(result.session).toBeDefined()
      })
    })

    describe('requireRole', () => {
      it('should return unauthorized for null session', () => {
        const result = requireRole(null, ['admin'])
        expect(result.authorized).toBe(false)
        expect(result.response?.status).toBe(401)
      })

      it('should return forbidden for wrong role', () => {
        const result = requireRole(mockSession as unknown as Session, ['admin'])
        expect(result.authorized).toBe(false)
        expect(result.response?.status).toBe(403)
      })

      it('should return authorized for correct role', () => {
        const result = requireRole(mockSession as unknown as Session, ['staff', 'manager'])
        expect(result.authorized).toBe(true)
      })

      it('should return authorized for admin role', () => {
        const result = requireRole(mockAdminSession as unknown as Session, ['admin'])
        expect(result.authorized).toBe(true)
      })
    })

    describe('requireVenueAccess', () => {
      it('should return unauthorized for null session', () => {
        const result = requireVenueAccess(null, 'venue-123')
        expect(result.authorized).toBe(false)
        expect(result.response?.status).toBe(401)
      })

      it('should return authorized for admin accessing any venue', () => {
        const result = requireVenueAccess(mockAdminSession as unknown as Session, 'any-venue')
        expect(result.authorized).toBe(true)
      })

      it('should return authorized for user accessing own venue', () => {
        const result = requireVenueAccess(mockSession as unknown as Session, 'venue-123')
        expect(result.authorized).toBe(true)
      })

      it('should return forbidden for user accessing other venue', () => {
        const result = requireVenueAccess(mockSession as unknown as Session, 'other-venue')
        expect(result.authorized).toBe(false)
        expect(result.response?.status).toBe(403)
      })
    })
  })

  describe('Pagination Helpers', () => {
    describe('parsePagination', () => {
      it('should return default values for null params', () => {
        const result = parsePagination(null, null)
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
        expect(result.skip).toBe(0)
      })

      it('should parse valid page and limit', () => {
        const result = parsePagination('3', '10')
        expect(result.page).toBe(3)
        expect(result.limit).toBe(10)
        expect(result.skip).toBe(20)
      })

      it('should respect maxLimit', () => {
        const result = parsePagination('1', '500', 100)
        expect(result.limit).toBe(100)
      })

      it('should use custom default limit', () => {
        const result = parsePagination(null, null, 100, 50)
        expect(result.limit).toBe(50)
      })

      it('should handle invalid page by defaulting to 1', () => {
        const result = parsePagination('-5', '10')
        expect(result.page).toBe(1)
      })

      it('should handle invalid limit by defaulting to 1', () => {
        const result = parsePagination('1', '-10')
        expect(result.limit).toBe(1)
      })
    })

    describe('paginatedResponse', () => {
      it('should return correct paginated response structure', () => {
        const data = [{ id: '1' }, { id: '2' }]
        const result = paginatedResponse(data, 50, { page: 2, limit: 10, skip: 10 })

        expect(result.data).toEqual(data)
        expect(result.pagination.page).toBe(2)
        expect(result.pagination.limit).toBe(10)
        expect(result.pagination.total).toBe(50)
        expect(result.pagination.totalPages).toBe(5)
      })

      it('should calculate totalPages correctly', () => {
        const result = paginatedResponse([], 25, { page: 1, limit: 10, skip: 0 })
        expect(result.pagination.totalPages).toBe(3)
      })

      it('should handle empty results', () => {
        const result = paginatedResponse([], 0, { page: 1, limit: 10, skip: 0 })
        expect(result.pagination.totalPages).toBe(0)
      })
    })
  })
})
