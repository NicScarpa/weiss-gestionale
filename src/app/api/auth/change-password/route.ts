import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { passwordSchema } from '@/lib/validations/password'
import { checkRequestRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/api-utils'

// Schema cambio password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password attuale obbligatoria'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Le password non coincidono',
    path: ['confirmPassword'],
  }
)

// POST /api/auth/change-password - Cambio password
export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRequestRateLimit(request, 'auth:change', RATE_LIMIT_CONFIGS.AUTH)
    if (!rateCheck.allowed) return rateCheck.response!

    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = changePasswordSchema.parse(body)

    // Recupera utente con password hash
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    // Verifica password attuale
    const isCurrentPasswordValid = await bcrypt.compare(
      validatedData.currentPassword,
      user.passwordHash
    )

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'Password attuale non corretta' },
        { status: 400 }
      )
    }

    // Verifica che la nuova password sia diversa dalla attuale
    const isSamePassword = await bcrypt.compare(
      validatedData.newPassword,
      user.passwordHash
    )

    if (isSamePassword) {
      return NextResponse.json(
        { error: 'La nuova password deve essere diversa dalla attuale' },
        { status: 400 }
      )
    }

    // Hash nuova password
    const newPasswordHash = await bcrypt.hash(validatedData.newPassword, 12)

    // Aggiorna password e rimuovi flag cambio obbligatorio
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    })

    return NextResponse.json({
      message: 'Password modificata con successo',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/auth/change-password', error)
    return NextResponse.json(
      { error: 'Errore nel cambio password' },
      { status: 500 }
    )
  }
}
