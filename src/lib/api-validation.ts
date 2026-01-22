/**
 * Utilities per validazione API con Zod
 * Fornisce wrapper per validare request body, query params e risposte
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from './logger'

/**
 * Errore di validazione custom
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public issues: z.ZodIssue[]
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Wrapper per validare il body di una request POST/PUT/PATCH
 */
export async function validateBody<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  try {
    const body = await request.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation error', { issues: error.issues })
      throw new ValidationError('Dati non validi', error.issues)
    }
    throw error
  }
}

/**
 * Wrapper per validare query params
 */
export function validateSearchParams<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): z.infer<T> {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries())
    return schema.parse(params)
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Query params validation error', { issues: error.issues })
      throw new ValidationError('Parametri non validi', error.issues)
    }
    throw error
  }
}

/**
 * Helper per creare risposte di errore di validazione
 */
export function validationErrorResponse(error: ValidationError): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    { status: 400 }
  )
}

/**
 * Helper per gestire errori in modo uniforme nelle API routes
 */
export function handleApiError(error: unknown, context: string): NextResponse {
  if (error instanceof ValidationError) {
    return validationErrorResponse(error)
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Dati non validi',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    )
  }

  logger.error(`Errore in ${context}`, error)
  return NextResponse.json(
    { error: 'Errore interno del server' },
    { status: 500 }
  )
}

/**
 * Schema comuni riutilizzabili
 */
export const commonSchemas = {
  // ID UUID
  id: z.string().uuid(),

  // Paginazione
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),

  // Date range
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }),

  // Ordinamento
  sorting: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
}
