import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Session } from 'next-auth'
import {
  checkRateLimit,
  getClientIp,
  getRateLimitKey,
  getRateLimitHeaders,
  RateLimitConfig,
  RateLimitResult,
  RATE_LIMIT_CONFIGS,
} from './rate-limit'

import { logger } from '@/lib/logger'
// Standard API error response format
export interface ApiErrorResponse {
  error: string
  details?: z.ZodIssue[] | unknown
  code?: string
}

// Standard API success response format
export interface ApiSuccessResponse<T> {
  data: T
  message?: string
}

// HTTP Status codes as named constants
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const

// Error response builders
export function errorResponse(
  message: string,
  status: number,
  details?: z.ZodIssue[] | unknown,
  code?: string
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = { error: message }
  if (details) body.details = details
  if (code) body.code = code
  return NextResponse.json(body, { status })
}

export function badRequest(message: string, details?: z.ZodIssue[] | unknown): NextResponse<ApiErrorResponse> {
  return errorResponse(message, HttpStatus.BAD_REQUEST, details)
}

export function unauthorized(message: string = 'Non autorizzato'): NextResponse<ApiErrorResponse> {
  return errorResponse(message, HttpStatus.UNAUTHORIZED)
}

export function forbidden(message: string = 'Accesso negato'): NextResponse<ApiErrorResponse> {
  return errorResponse(message, HttpStatus.FORBIDDEN)
}

export function notFound(message: string = 'Risorsa non trovata'): NextResponse<ApiErrorResponse> {
  return errorResponse(message, HttpStatus.NOT_FOUND)
}

export function conflict(message: string, existingId?: string): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse & { existingId?: string } = { error: message }
  if (existingId) (body as any).existingId = existingId
  return NextResponse.json(body, { status: HttpStatus.CONFLICT })
}

export function internalError(message: string = 'Errore interno del server'): NextResponse<ApiErrorResponse> {
  return errorResponse(message, HttpStatus.INTERNAL_SERVER_ERROR)
}

// Success response builders
export function ok<T>(data: T): NextResponse<T> {
  return NextResponse.json(data)
}

export function created<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { status: HttpStatus.CREATED })
}

// Type guard for ZodError
export function isZodError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError
}

// Unified error handler
export function handleApiError(
  error: unknown,
  context: string,
  defaultMessage: string = 'Errore interno'
): NextResponse<ApiErrorResponse> {
  if (isZodError(error)) {
    return badRequest('Dati non validi', error.issues)
  }

  // Log error for debugging (preserves existing behavior)
  logger.error(`Errore ${context}:`, error)

  return internalError(defaultMessage)
}

// Auth check helpers
export interface AuthCheckResult {
  authorized: boolean
  response?: NextResponse<ApiErrorResponse>
  session?: Session
}

export function requireAuth(session: Session | null): AuthCheckResult {
  if (!session?.user) {
    return {
      authorized: false,
      response: unauthorized(),
    }
  }
  return { authorized: true, session }
}

export function requireRole(
  session: Session | null,
  allowedRoles: string[]
): AuthCheckResult {
  const authCheck = requireAuth(session)
  if (!authCheck.authorized) return authCheck

  if (!allowedRoles.includes(session!.user.role)) {
    return {
      authorized: false,
      response: forbidden(),
    }
  }
  return { authorized: true, session: session! }
}

export function requireVenueAccess(
  session: Session | null,
  venueId: string
): AuthCheckResult {
  const authCheck = requireAuth(session)
  if (!authCheck.authorized) return authCheck

  // Admin can access all venues
  if (session!.user.role === 'admin') {
    return { authorized: true, session: session! }
  }

  // Other users can only access their own venue
  if (session!.user.venueId !== venueId) {
    return {
      authorized: false,
      response: forbidden('Non autorizzato per questa sede'),
    }
  }

  return { authorized: true, session: session! }
}

// Pagination helpers
export interface PaginationParams {
  page: number
  limit: number
  skip: number
}

export function parsePagination(
  pageParam: string | null,
  limitParam: string | null,
  maxLimit: number = 100,
  defaultLimit: number = 20
): PaginationParams {
  const page = Math.max(1, parseInt(pageParam || '1', 10))
  const limit = Math.min(maxLimit, Math.max(1, parseInt(limitParam || String(defaultLimit), 10)))
  const skip = (page - 1) * limit

  return { page, limit, skip }
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  }
}

// Rate limiting helpers
export { RATE_LIMIT_CONFIGS } from './rate-limit'
export type { RateLimitConfig, RateLimitResult } from './rate-limit'

export interface RateLimitCheckResult {
  allowed: boolean
  response?: NextResponse<ApiErrorResponse>
  result: RateLimitResult
}

/**
 * Check rate limit for a request
 * @param request - The NextRequest object
 * @param prefix - A prefix to namespace the rate limit (e.g., 'auth', 'api')
 * @param config - Rate limit configuration (defaults to API config)
 * @param userId - Optional user ID for per-user rate limiting
 */
export function checkRequestRateLimit(
  request: NextRequest,
  prefix: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.API,
  userId?: string
): RateLimitCheckResult {
  const ip = getClientIp(request.headers)
  const key = getRateLimitKey(prefix, ip, userId)
  const result = checkRateLimit(key, config)

  if (!result.success) {
    const headers = getRateLimitHeaders(result)
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Troppe richieste. Riprova più tardi.',
          code: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
          },
        }
      ),
      result,
    }
  }

  return { allowed: true, result }
}

/**
 * Add rate limit headers to a successful response
 */
export function withRateLimitHeaders<T>(
  response: NextResponse<T>,
  result: RateLimitResult
): NextResponse<T> {
  const headers = getRateLimitHeaders(result)
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}
