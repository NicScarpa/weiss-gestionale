import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
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
 * Legge il link di invito generico attivo, se c'è. Non ne crea: un invito è una
 * credenziale valida sette giorni, e prima questa GET la emetteva ogni volta che
 * non ne trovava una — cioè un prefetch, una pagina ricaricata o un link aperto
 * per sbaglio bastavano a generarla. L'emissione vive solo nella POST.
 */
export const GET = withAuth(
  async () => {
    try {
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

      if (!existing) {
        return NextResponse.json({
          token: null,
          url: null,
          expiresAt: null,
          emailSent: false,
        })
      }

      return NextResponse.json({
        token: existing.token,
        url: buildInviteUrl(existing.token),
        expiresAt: existing.expiresAt,
        emailSent: false,
      })
    } catch (error) {
      logger.error('Errore GET /api/staff/invite', error)
      return NextResponse.json(
        { error: 'Si e verificato un errore. Riprova piu tardi.' },
        { status: 500 }
      )
    }
  },
  { roles: ['admin'] }
)

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
export const POST = withAuth(
  async (request, { user }) => {
  try {
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
        invitedById: user.id,
        expiresAt,
      },
    })

    logger.info('[StaffInvite] Link invito rigenerato', {
      token,
      email: email || null,
      invitedBy: user.id,
    })

    // Se l'invito è vincolato a un'email, spediscilo al dipendente.
    // Un fallimento non blocca il flusso: la UI mostra comunque il link da copiare.
    let emailSent = false
    if (invitation.email) {
      const invitedByName = [user.firstName, user.lastName]
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
          invitedBy: user.id,
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
  },
  { roles: ['admin'] }
)
