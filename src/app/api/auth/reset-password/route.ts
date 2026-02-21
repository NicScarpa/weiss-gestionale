import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { passwordSchema } from '@/lib/validations/password'
import { checkRequestRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/api-utils'

// Schema per reset password
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token obbligatorio'),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: 'Le password non coincidono',
    path: ['confirmPassword'],
  }
)

/**
 * POST /api/auth/reset-password
 *
 * Reimposta la password usando un token valido.
 */
export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRequestRateLimit(request, 'auth:reset', RATE_LIMIT_CONFIGS.AUTH)
    if (!rateCheck.allowed) return rateCheck.response!

    const body = await request.json()
    const { token, password } = resetPasswordSchema.parse(body)

    // Cerca utente con token valido e non scaduto
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(), // Token non scaduto
        },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    })

    if (!user) {
      logger.warn('[ResetPassword] Token non valido o scaduto', { token: token.substring(0, 8) + '...' })
      return NextResponse.json(
        { error: 'Il link per il reset è scaduto o non valido. Richiedi un nuovo link.' },
        { status: 400 }
      )
    }

    // Hash nuova password
    const passwordHash = await bcrypt.hash(password, 12)

    // Aggiorna password e invalida token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        mustChangePassword: false, // Non richiede più cambio obbligatorio
      },
    })

    logger.info('[ResetPassword] Password reimpostata con successo', {
      userId: user.id,
      username: user.username,
    })

    return NextResponse.json({
      message: 'Password reimpostata con successo. Ora puoi accedere con la nuova password.',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/auth/reset-password', error)
    return NextResponse.json(
      { error: 'Si è verificato un errore. Riprova più tardi.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/auth/reset-password?token=xxx
 *
 * Verifica se un token è valido (usato dalla pagina per mostrare errore preventivo).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token mancante' },
        { status: 400 }
      )
    }

    // Verifica token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { valid: false, error: 'Il link per il reset è scaduto o non valido.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    logger.error('Errore GET /api/auth/reset-password', error)
    return NextResponse.json(
      { valid: false, error: 'Errore nella verifica del token' },
      { status: 500 }
    )
  }
}
