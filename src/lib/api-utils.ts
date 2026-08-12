import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Session } from 'next-auth'
import { auth } from './auth'
import { getVenueId } from './venue'
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
  if (existingId) (body as ApiErrorResponse & { existingId?: string }).existingId = existingId
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
//
// Unione discriminata e non un oggetto con tre campi facoltativi: il controllo
// o è passato — e allora c'è la sessione — o è fallito, e allora c'è la
// risposta. Detto con `authorized: boolean` e due campi opzionali, il
// compilatore non lo sapeva, e chi scriveva `return check.response` dentro un
// `if (!check.authorized)` restituiva un `NextResponse | undefined`: una route
// che, per il tipo, poteva non rispondere affatto. Da qui i `!` sparsi qui
// sotto, che ora non servono più.
export type AuthCheckResult =
  | { authorized: true; session: Session; response?: undefined }
  | { authorized: false; response: NextResponse<ApiErrorResponse>; session?: undefined }

export function requireAuth(session: Session | null, allowMustChangePassword = false): AuthCheckResult {
  if (!session?.user) {
    return {
      authorized: false,
      response: unauthorized(),
    }
  }
  if (!allowMustChangePassword && session.user.mustChangePassword) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Devi cambiare la password', code: 'MUST_CHANGE_PASSWORD' },
        { status: 403 }
      ),
    }
  }
  return { authorized: true, session }
}

export function requireRole(
  session: Session | null,
  allowedRoles: string[],
  allowMustChangePassword = false
): AuthCheckResult {
  const authCheck = requireAuth(session, allowMustChangePassword)
  if (!authCheck.authorized) return authCheck

  // `authCheck.session` e non `session!`: dopo la riga sopra è l'unione a
  // garantire che ci sia, senza doverlo affermare.
  if (!allowedRoles.includes(authCheck.session.user.role)) {
    return {
      authorized: false,
      response: forbidden(),
    }
  }
  return authCheck
}

export function requireVenueAccess(
  session: Session | null,
  venueId?: string
): AuthCheckResult {
  const authCheck = requireAuth(session)
  if (!authCheck.authorized) return authCheck
  const utente = authCheck.session.user
  if (utente.role === 'admin') return authCheck
  if (venueId && utente.venueId !== venueId) {
    return { authorized: false, response: forbidden('Non hai accesso a questa sede') }
  }
  return authCheck
}

/**
 * Guard di autenticazione e autorizzazione per le route dell'App Router.
 *
 * Sostituisce il `const session = await auth()` ripetuto a mano in ogni route:
 * quella ripetizione è la causa dei buchi trovati dall'audit di agosto 2026,
 * perché il controllo di ruolo veniva dimenticato o scritto in forme diverse.
 * Qui la sessione si risolve una volta sola e i tre controlli passano dagli
 * helper già testati sopra (`requireAuth`, `requireRole`, `requireVenueAccess`).
 *
 * Uso:
 *   export const GET = withAuth(
 *     async (request, { venueId }) => ok(await leggi(venueId)),
 *     { roles: ['admin', 'manager'], venueScoped: true }
 *   )
 *
 * `venueId` arriva SEMPRE dalla sessione (o, per chi non ne dichiara una, dalla
 * sede attiva): mai dalla query string o dal body, che sono sotto il controllo
 * del client.
 */
export interface WithAuthOptions {
  /** Ruoli ammessi. Omesso: è sufficiente essere autenticati. */
  roles?: readonly string[]
  /** Risolve la sede e la passa allo handler in `venueId`. */
  venueScoped?: boolean
  /**
   * Consente l'accesso anche a chi deve ancora cambiare la password. Serve solo
   * alle route del cambio password stesso: ovunque altro lasciarlo a `false`.
   */
  allowMustChangePassword?: boolean
}

/** Parametri di rotta risolti: `{}` sulle route statiche. */
type EmptyParams = Record<string, never>

export interface AuthContext<TParams = EmptyParams> {
  session: Session
  user: Session['user']
  /** Segmenti dinamici della rotta, già attesi. */
  params: TParams
}

export interface VenueScopedContext<TParams = EmptyParams> extends AuthContext<TParams> {
  venueId: string
}

/** Secondo argomento che l'App Router passa alle route dinamiche. */
interface RouteContext<TParams> {
  params: Promise<TParams>
}

type AuthedRoute<TParams> = (
  request: NextRequest,
  routeContext?: RouteContext<TParams>
) => Promise<Response>

type AuthHandler<TParams> = (
  request: NextRequest,
  context: AuthContext<TParams>
) => Promise<Response> | Response

type VenueScopedHandler<TParams> = (
  request: NextRequest,
  context: VenueScopedContext<TParams>
) => Promise<Response> | Response

export function withAuth<TParams = EmptyParams>(
  handler: VenueScopedHandler<TParams>,
  options: WithAuthOptions & { venueScoped: true }
): AuthedRoute<TParams>

export function withAuth<TParams = EmptyParams>(
  handler: AuthHandler<TParams>,
  options?: WithAuthOptions & { venueScoped?: false }
): AuthedRoute<TParams>

export function withAuth<TParams = EmptyParams>(
  handler: AuthHandler<TParams> | VenueScopedHandler<TParams>,
  options: WithAuthOptions = {}
): AuthedRoute<TParams> {
  const { roles, venueScoped = false, allowMustChangePassword = false } = options

  return async function authenticatedRoute(request, routeContext) {
    const session = await auth()

    const check = roles?.length
      ? requireRole(session, [...roles], allowMustChangePassword)
      : requireAuth(session, allowMustChangePassword)
    if (!check.authorized) return check.response

    const authorizedSession = check.session
    const params = ((await routeContext?.params) ?? {}) as TParams
    const base: AuthContext<TParams> = {
      session: authorizedSession,
      user: authorizedSession.user,
      params,
    }

    if (!venueScoped) {
      return (handler as AuthHandler<TParams>)(request, base)
    }

    let venueId: string
    try {
      // Chi ha una sede in sessione usa quella; gli admin, che possono non
      // averla, ricadono sull'unica sede attiva (l'app è single-venue: vedi
      // il commento in cima a src/lib/venue.ts).
      venueId = authorizedSession.user.venueId ?? (await getVenueId())
    } catch (error) {
      logger.error('Sede non risolvibile in withAuth', error)
      return internalError()
    }

    const venueCheck = requireVenueAccess(authorizedSession, venueId)
    if (!venueCheck.authorized) return venueCheck.response

    return (handler as VenueScopedHandler<TParams>)(request, { ...base, venueId })
  }
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
