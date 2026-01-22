/**
 * Error Handling Centralizzato
 * Classi errore custom per gestione errori strutturata
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { logger } from './logger'

// ========== CUSTOM ERROR CLASSES ==========

/**
 * Errore base dell'applicazione
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly isOperational: boolean
  public readonly details?: unknown

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    isOperational = true,
    details?: unknown
  ) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.isOperational = isOperational
    this.details = details

    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Errore di autenticazione (401)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Non autorizzato', details?: unknown) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, details)
  }
}

/**
 * Errore di autorizzazione (403)
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Accesso negato', details?: unknown) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, details)
  }
}

/**
 * Errore risorsa non trovata (404)
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Risorsa', details?: unknown) {
    super(`${resource} non trovato/a`, 404, 'NOT_FOUND', true, details)
  }
}

/**
 * Errore di validazione (400)
 */
export class ValidationError extends AppError {
  constructor(message = 'Dati non validi', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', true, details)
  }
}

/**
 * Errore di conflitto (409)
 */
export class ConflictError extends AppError {
  constructor(message = 'Risorsa già esistente', details?: unknown) {
    super(message, 409, 'CONFLICT_ERROR', true, details)
  }
}

/**
 * Errore rate limit (429)
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number

  constructor(message = 'Troppe richieste', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_ERROR', true, { retryAfter })
    this.retryAfter = retryAfter
  }
}

/**
 * Errore business logic (422)
 */
export class BusinessError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'BUSINESS_ERROR', true, details)
  }
}

/**
 * Errore database/Prisma
 */
export class DatabaseError extends AppError {
  constructor(message = 'Errore database', originalError?: Error) {
    super(message, 500, 'DATABASE_ERROR', true, {
      originalMessage: originalError?.message,
    })
  }
}

/**
 * Errore servizio esterno
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string, details?: unknown) {
    super(
      message || `Errore servizio: ${service}`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      true,
      { service, ...((details as object) || {}) }
    )
  }
}

// ========== ERROR RESPONSE BUILDER ==========

export interface ErrorResponse {
  error: string
  code: string
  details?: unknown
  timestamp: string
  requestId?: string
}

/**
 * Costruisce una risposta di errore standardizzata
 */
export function buildErrorResponse(
  error: AppError | Error | ZodError,
  requestId?: string
): { response: ErrorResponse; statusCode: number } {
  const timestamp = new Date().toISOString()

  // Errore Zod (validazione)
  if (error instanceof ZodError) {
    return {
      response: {
        error: 'Dati non validi',
        code: 'VALIDATION_ERROR',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
        timestamp,
        requestId,
      },
      statusCode: 400,
    }
  }

  // Errore custom dell'app
  if (error instanceof AppError) {
    return {
      response: {
        error: error.message,
        code: error.code,
        details: error.details,
        timestamp,
        requestId,
      },
      statusCode: error.statusCode,
    }
  }

  // Errore generico - non esporre dettagli in produzione
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    response: {
      error: isProduction ? 'Errore interno del server' : error.message,
      code: 'INTERNAL_ERROR',
      details: isProduction ? undefined : { stack: error.stack },
      timestamp,
      requestId,
    },
    statusCode: 500,
  }
}

// ========== API ERROR HANDLER ==========

/**
 * Handler centralizzato per errori nelle API routes
 */
export function handleApiError(
  error: unknown,
  context?: { endpoint?: string; requestId?: string }
): NextResponse<ErrorResponse> {
  const { endpoint = 'unknown', requestId } = context || {}

  // Log dell'errore
  if (error instanceof AppError) {
    if (error.isOperational) {
      logger.warn(`API Error [${endpoint}]`, {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        requestId,
      })
    } else {
      logger.error(`Critical API Error [${endpoint}]`, error, { requestId })
    }
  } else if (error instanceof ZodError) {
    logger.warn(`Validation Error [${endpoint}]`, {
      issues: error.issues,
      requestId,
    })
  } else {
    logger.error(`Unexpected Error [${endpoint}]`, error as Error, { requestId })
  }

  // Costruisci risposta
  const { response, statusCode } = buildErrorResponse(
    error instanceof Error ? error : new Error(String(error)),
    requestId
  )

  // Headers aggiuntivi per rate limit
  const headers: Record<string, string> = {}
  if (error instanceof RateLimitError && error.retryAfter) {
    headers['Retry-After'] = error.retryAfter.toString()
  }

  return NextResponse.json(response, { status: statusCode, headers })
}

// ========== PRISMA ERROR HANDLER ==========

/**
 * Converte errori Prisma in errori applicativi
 */
export function handlePrismaError(error: unknown): AppError {
  // Prisma error codes: https://www.prisma.io/docs/reference/api-reference/error-reference
  const prismaError = error as { code?: string; meta?: { target?: string[] } }

  switch (prismaError.code) {
    case 'P2002': // Unique constraint violation
      return new ConflictError(
        `Record già esistente: ${prismaError.meta?.target?.join(', ') || 'campo unico'}`
      )

    case 'P2025': // Record not found
      return new NotFoundError('Record')

    case 'P2003': // Foreign key constraint violation
      return new ValidationError('Riferimento non valido')

    case 'P2014': // Relation violation
      return new BusinessError('Impossibile modificare: esistono record correlati')

    default:
      return new DatabaseError('Errore database', error as Error)
  }
}

// ========== ASYNC WRAPPER ==========

type AsyncHandler<T> = () => Promise<T>

/**
 * Wrapper per gestione automatica errori in funzioni async
 */
export async function tryCatch<T>(
  handler: AsyncHandler<T>,
  context?: { endpoint?: string; requestId?: string }
): Promise<T | NextResponse<ErrorResponse>> {
  try {
    return await handler()
  } catch (error) {
    return handleApiError(error, context)
  }
}

/**
 * Verifica se l'errore è operazionale (gestibile) o critico
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational
  }
  return false
}

// ========== ERROR ASSERTIONS ==========

/**
 * Assert che una condizione sia vera, altrimenti lancia ValidationError
 */
export function assertValid(
  condition: boolean,
  message: string,
  details?: unknown
): asserts condition {
  if (!condition) {
    throw new ValidationError(message, details)
  }
}

/**
 * Assert che un valore esista, altrimenti lancia NotFoundError
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource)
  }
}

/**
 * Assert che l'utente sia autenticato
 */
export function assertAuthenticated(
  session: { user?: unknown } | null
): asserts session is { user: unknown } {
  if (!session?.user) {
    throw new AuthenticationError()
  }
}

/**
 * Assert che l'utente sia admin
 */
export function assertAdmin(
  session: { user?: { role?: string } } | null
): asserts session is { user: { role: 'admin' } } {
  if (!session?.user) {
    throw new AuthenticationError()
  }
  if (session.user.role !== 'admin') {
    throw new AuthorizationError('Richiesti privilegi di amministratore')
  }
}
