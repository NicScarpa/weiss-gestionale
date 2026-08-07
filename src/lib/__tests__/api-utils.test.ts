import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { NextRequest } from 'next/server'
import type { Session } from 'next-auth'
import { logger } from '../logger'

// `withAuth` risolve da sé sessione e sede: qui entrambe sono finte, così le
// asserzioni riguardano il guard e non NextAuth o il database.
vi.mock('../auth', () => ({ auth: vi.fn() }))
vi.mock('../venue', () => ({ getVenueId: vi.fn() }))

import { auth } from '../auth'
import { getVenueId } from '../venue'
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
  withAuth,
  parsePagination,
  paginatedResponse,
  HttpStatus,
} from '../api-utils'

// Mock console.error for testing
// handleApiError logga tramite il logger strutturato, non console
vi.spyOn(logger, 'error').mockImplementation(() => {})

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
      expect(logger.error).toHaveBeenCalled()
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

describe('withAuth', () => {
  const authMock = vi.mocked(auth as unknown as () => Promise<Session | null>)
  const getVenueIdMock = vi.mocked(getVenueId as unknown as () => Promise<string>)

  const VENUE = 'venue-attiva'

  function sessionOf(role: string, overrides: Record<string, unknown> = {}): Session {
    return {
      user: {
        id: `${role}-1`,
        email: `${role}@weisscafe.it`,
        role,
        venueId: VENUE,
        mustChangePassword: false,
        ...overrides,
      },
      expires: '2099-01-01',
    } as unknown as Session
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getVenueIdMock.mockResolvedValue(VENUE)
  })

  const request = (url = 'http://localhost:3000/api/test') => new NextRequest(url)

  describe('autenticazione', () => {
    it('risponde 401 senza sessione e non esegue lo handler', async () => {
      authMock.mockResolvedValue(null)
      const handler = vi.fn()

      const response = await withAuth(handler)(request())

      expect(response.status).toBe(401)
      expect(handler).not.toHaveBeenCalled()
    })

    it('risponde 403 MUST_CHANGE_PASSWORD a chi deve cambiare la password', async () => {
      authMock.mockResolvedValue(sessionOf('admin', { mustChangePassword: true }))
      const handler = vi.fn()

      const response = await withAuth(handler)(request())
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.code).toBe('MUST_CHANGE_PASSWORD')
      expect(handler).not.toHaveBeenCalled()
    })

    it('lascia passare chi deve cambiare la password se la route lo consente', async () => {
      authMock.mockResolvedValue(sessionOf('staff', { mustChangePassword: true }))
      const handler = vi.fn().mockResolvedValue(ok({ fatto: true }))

      const response = await withAuth(handler, { allowMustChangePassword: true })(request())

      expect(response.status).toBe(200)
      expect(handler).toHaveBeenCalledOnce()
    })

    it('risolve la sessione una sola volta per richiesta', async () => {
      authMock.mockResolvedValue(sessionOf('manager'))
      const handler = vi.fn().mockResolvedValue(ok({}))

      await withAuth(handler, { roles: ['admin', 'manager'], venueScoped: true })(request())

      expect(authMock).toHaveBeenCalledOnce()
    })
  })

  describe('autorizzazione per ruolo', () => {
    it('risponde 403 a uno staff su una route riservata ad admin e manager', async () => {
      authMock.mockResolvedValue(sessionOf('staff'))
      const handler = vi.fn()

      const response = await withAuth(handler, { roles: ['admin', 'manager'] })(request())

      expect(response.status).toBe(403)
      expect(handler).not.toHaveBeenCalled()
    })

    it('esegue lo handler per un ruolo ammesso e gli passa utente e sessione', async () => {
      const session = sessionOf('manager')
      authMock.mockResolvedValue(session)
      const handler = vi.fn().mockResolvedValue(ok({}))

      await withAuth(handler, { roles: ['admin', 'manager'] })(request())

      const context = handler.mock.calls[0][1]
      expect(context.session).toBe(session)
      expect(context.user.id).toBe('manager-1')
      expect(context.user.role).toBe('manager')
    })

    it('senza elenco di ruoli basta essere autenticati', async () => {
      authMock.mockResolvedValue(sessionOf('staff'))
      const handler = vi.fn().mockResolvedValue(ok({}))

      const response = await withAuth(handler)(request())

      expect(response.status).toBe(200)
    })
  })

  describe('sede', () => {
    it('ricava venueId dalla sessione ignorando la query string', async () => {
      authMock.mockResolvedValue(sessionOf('manager'))
      const handler = vi.fn().mockResolvedValue(ok({}))

      await withAuth(handler, { roles: ['manager'], venueScoped: true })(
        request('http://localhost:3000/api/test?venueId=sede-di-un-altro')
      )

      expect(handler.mock.calls[0][1].venueId).toBe(VENUE)
    })

    it("usa la sede attiva quando la sessione non ne dichiara una (admin)", async () => {
      authMock.mockResolvedValue(sessionOf('admin', { venueId: null }))
      const handler = vi.fn().mockResolvedValue(ok({}))

      await withAuth(handler, { roles: ['admin'], venueScoped: true })(request())

      expect(handler.mock.calls[0][1].venueId).toBe(VENUE)
    })

    it('nega la sede a un non-admin che non ne ha alcuna in sessione', async () => {
      authMock.mockResolvedValue(sessionOf('manager', { venueId: null }))
      const handler = vi.fn()

      const response = await withAuth(handler, { roles: ['manager'], venueScoped: true })(request())

      expect(response.status).toBe(403)
      expect(handler).not.toHaveBeenCalled()
    })

    it('non risolve la sede se la route non è venueScoped', async () => {
      authMock.mockResolvedValue(sessionOf('admin'))
      const handler = vi.fn().mockResolvedValue(ok({}))

      await withAuth(handler)(request())

      expect(getVenueIdMock).not.toHaveBeenCalled()
    })

    it('risponde 500 se non esiste una sede attiva', async () => {
      authMock.mockResolvedValue(sessionOf('admin', { venueId: null }))
      getVenueIdMock.mockRejectedValue(new Error('Nessuna sede attiva configurata'))
      const handler = vi.fn()

      const response = await withAuth(handler, { venueScoped: true })(request())

      expect(response.status).toBe(500)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('parametri di rotta', () => {
    it('passa allo handler i params già risolti', async () => {
      authMock.mockResolvedValue(sessionOf('admin'))
      const handler = vi.fn().mockResolvedValue(ok({}))

      await withAuth<{ id: string }>(handler)(request(), {
        params: Promise.resolve({ id: 'chiusura-42' }),
      })

      expect(handler.mock.calls[0][1].params).toEqual({ id: 'chiusura-42' })
    })

    it('su una route statica i params sono un oggetto vuoto', async () => {
      authMock.mockResolvedValue(sessionOf('admin'))
      const handler = vi.fn().mockResolvedValue(ok({}))

      await withAuth(handler)(request())

      expect(handler.mock.calls[0][1].params).toEqual({})
    })
  })
})
