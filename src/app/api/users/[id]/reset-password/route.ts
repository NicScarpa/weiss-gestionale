import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { canPerformAction, type UserRole } from '@/lib/utils/permissions'

import { logger } from '@/lib/logger'
// Password iniziale di default
const DEFAULT_PASSWORD = '1234567890'

// POST /api/users/[id]/reset-password - Reset password a valore iniziale
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const userRole = session.user.role as UserRole

    // Non può resettare la propria password con questo endpoint
    if (id === session.user.id) {
      return NextResponse.json(
        { error: 'Usa il form di cambio password per modificare la tua password' },
        { status: 400 }
      )
    }

    // Recupera utente target
    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    const targetRole = targetUser.role.name as UserRole

    // Verifica permessi
    if (!canPerformAction('user:reset-password', userRole, targetRole)) {
      return NextResponse.json(
        { error: 'Non hai i permessi per resettare la password di questo utente' },
        { status: 403 }
      )
    }

    // Manager può resettare solo utenti della propria sede
    if (userRole === 'manager') {
      if (targetUser.venueId !== session.user.venueId) {
        return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
      }
    }

    // Hash nuova password
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12)

    // Aggiorna password e forza cambio al prossimo login
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    })

    return NextResponse.json({
      message: 'Password resettata con successo',
      credentials: {
        username: targetUser.username,
        password: DEFAULT_PASSWORD,
        mustChangePassword: true,
      },
    })
  } catch (error) {
    logger.error('Errore POST /api/users/[id]/reset-password', error)
    return NextResponse.json(
      { error: 'Errore nel reset della password' },
      { status: 500 }
    )
  }
}
