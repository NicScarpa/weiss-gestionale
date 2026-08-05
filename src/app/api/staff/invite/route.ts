import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { sendStaffInvitationEmail } from '@/lib/email-invitation'

// Token valido per 7 giorni
const TOKEN_EXPIRY_DAYS = 7

function buildInviteUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${baseUrl}/invito?token=${token}`
}

/**
 * GET /api/staff/invite
 *
 * Recupera o genera un link di invito generico (senza email/nome).
 * Solo admin.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    // Cerca token generico attivo (email=null, non usato, non scaduto, attivo)
    const existing = await prisma.invitationToken.findFirst({
      where: {
        email: null,
        usedAt: null,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) {
      return NextResponse.json({
        token: existing.token,
        url: buildInviteUrl(existing.token),
        expiresAt: existing.expiresAt,
        emailSent: false,
      })
    }

    // Crea nuovo token generico
    const token = globalThis.crypto.randomUUID()
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    const invitation = await prisma.invitationToken.create({
      data: {
        token,
        invitedById: session.user.id,
        expiresAt,
      },
    })

    logger.info('[StaffInvite] Link generico creato', {
      token,
      invitedBy: session.user.id,
    })

    return NextResponse.json({
      token: invitation.token,
      url: buildInviteUrl(invitation.token),
      expiresAt: invitation.expiresAt,
      emailSent: false,
    })
  } catch (error) {
    logger.error('Errore GET /api/staff/invite', error)
    return NextResponse.json(
      { error: 'Si e verificato un errore. Riprova piu tardi.' },
      { status: 500 }
    )
  }
}

const regenerateSchema = z.object({
  action: z.literal('regenerate'),
  email: z.string().email('Email non valida').optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
})

/**
 * POST /api/staff/invite
 *
 * Rigenera il link di invito generico. Invalida tutti i token generici attivi
 * e ne crea uno nuovo. Solo admin.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    const body = await request.json()
    const { email, firstName, lastName } = regenerateSchema.parse(body)

    // Disattiva tutti i token generici attivi
    await prisma.invitationToken.updateMany({
      where: {
        email: null,
        isActive: true,
        usedAt: null,
      },
      data: {
        isActive: false,
      },
    })

    // Crea nuovo token (con email vincolata se specificata)
    const token = globalThis.crypto.randomUUID()
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    const invitation = await prisma.invitationToken.create({
      data: {
        token,
        email: email?.toLowerCase() || null,
        firstName: firstName || null,
        lastName: lastName || null,
        invitedById: session.user.id,
        expiresAt,
      },
    })

    logger.info('[StaffInvite] Link invito rigenerato', {
      token,
      email: email || null,
      invitedBy: session.user.id,
    })

    // Se l'invito è vincolato a un'email, spediscilo al dipendente.
    // Un fallimento non blocca il flusso: la UI mostra comunque il link da copiare.
    let emailSent = false
    if (invitation.email) {
      const invitedByName = [session.user.firstName, session.user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim()

      emailSent = await sendStaffInvitationEmail({
        email: invitation.email,
        token: invitation.token,
        firstName: invitation.firstName,
        invitedByName: invitedByName || null,
      })

      if (!emailSent) {
        logger.error('[StaffInvite] Invito creato ma invio email fallito', {
          email: invitation.email,
          invitedBy: session.user.id,
        })
      }
    }

    return NextResponse.json({
      token: invitation.token,
      url: buildInviteUrl(invitation.token),
      expiresAt: invitation.expiresAt,
      email: invitation.email || null,
      emailSent,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/staff/invite', error)
    return NextResponse.json(
      { error: 'Si e verificato un errore. Riprova piu tardi.' },
      { status: 500 }
    )
  }
}
