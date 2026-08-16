import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { canPerformAction, type UserRole } from '@/lib/utils/permissions'
import { sendPortalAccessEmail, INVITE_EXPIRY_DAYS } from '@/lib/email-invitation'
import { generaPasswordTemporanea } from '@/lib/password-temporanea'

import { logger } from '@/lib/logger'

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

    // Genera password temporanea sicura (e leggibile: va dettata all'utente)
    const temporaryPassword = generaPasswordTemporanea()
    const passwordHash = await bcrypt.hash(temporaryPassword, 12)

    // Se l'utente ha un'email gli si manda anche il link per impostarsela da
    // solo: la password temporanea resta valida come seconda strada, per chi
    // non ha email o non la riceve.
    const resetToken = targetUser.email ? crypto.randomBytes(32).toString('hex') : null
    const resetTokenExpiry = resetToken
      ? new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
      : null

    // Aggiorna password e forza cambio al prossimo login
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        resetToken,
        resetTokenExpiry,
      },
    })

    // L'invio non deve far fallire il reset: la password temporanea è già
    // valida e viene comunque mostrata a chi ha premuto il pulsante.
    let emailSentTo: string | null = null
    if (targetUser.email && resetToken) {
      const inviato = await sendPortalAccessEmail({
        email: targetUser.email,
        token: resetToken,
        firstName: targetUser.firstName,
        invitedByName: null,
      })
      if (inviato) {
        emailSentTo = targetUser.email
      } else {
        logger.error('Reset password: invio email fallito', { userId: id })
      }
    }

    return NextResponse.json({
      message: 'Password resettata con successo',
      emailSentTo,
      credentials: {
        username: targetUser.username,
        temporaryPassword,
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
