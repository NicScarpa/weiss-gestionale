import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import crypto from 'crypto'
import { sendPasswordResetEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { checkRequestRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/api-utils'

// Schema per richiesta reset password
const forgotPasswordSchema = z.object({
  email: z.string().email('Email non valida'),
})

// Durata token reset: 1 ora
const TOKEN_EXPIRY_HOURS = 1

/**
 * POST /api/auth/forgot-password
 *
 * Richiede un link per il reset della password.
 * Per motivi di sicurezza, la risposta è sempre positiva
 * (non rivela se l'email esiste o meno).
 */
export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRequestRateLimit(request, 'auth:forgot', RATE_LIMIT_CONFIGS.AUTH)
    if (!rateCheck.allowed) return rateCheck.response!

    const body = await request.json()
    const { email } = forgotPasswordSchema.parse(body)

    // Cerca utente per email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
      },
    })

    // Se l'utente esiste ed è attivo, invia email
    if (user && user.isActive && user.email) {
      // Genera token sicuro
      const resetToken = crypto.randomBytes(32).toString('hex')
      const resetTokenExpiry = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

      // Salva token nel database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        },
      })

      // Invia email in modo sincrono per poter loggare eventuali errori
      const emailSent = await sendPasswordResetEmail(user.email, resetToken, user.username)

      if (emailSent) {
        logger.info('[ForgotPassword] Token generato e email inviata', {
          userId: user.id,
          email: user.email
        })
      } else {
        logger.error('[ForgotPassword] Token generato ma invio email fallito', {
          userId: user.id,
          email: user.email
        })
      }
    } else {
      // Log per debug (utente non trovato o inattivo)
      logger.info('[ForgotPassword] Richiesta per email non valida', {
        email,
        found: !!user,
        active: user?.isActive,
        hasEmail: !!user?.email,
      })
    }

    // Risposta sempre positiva per sicurezza (non rivelare se email esiste)
    return NextResponse.json({
      message: 'Se l\'indirizzo email è registrato, riceverai un\'email con le istruzioni per reimpostare la password.',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Email non valida', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/auth/forgot-password', error)
    return NextResponse.json(
      { error: 'Si è verificato un errore. Riprova più tardi.' },
      { status: 500 }
    )
  }
}
