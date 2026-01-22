import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { compare } from 'bcryptjs'

import { logger } from '@/lib/logger'
// POST /api/auth/verify-password
// Verifica la password dell'utente corrente per operazioni sensibili
export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json(
        { error: 'Password richiesta' },
        { status: 400 }
      )
    }

    // Recupera l'utente dal database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Utente non trovato' },
        { status: 404 }
      )
    }

    // Verifica la password
    const isValid = await compare(password, user.passwordHash)

    return NextResponse.json({ valid: isValid })
  } catch (error) {
    logger.error('Errore verifica password', error)
    return NextResponse.json(
      { error: 'Errore nella verifica' },
      { status: 500 }
    )
  }
}
