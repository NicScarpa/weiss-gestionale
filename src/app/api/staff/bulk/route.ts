import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import crypto from 'crypto'
import { logger } from '@/lib/logger'
import { sendPortalAccessEmail, INVITE_EXPIRY_DAYS } from '@/lib/email-invitation'

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, 'Seleziona almeno un dipendente'),
  action: z.enum(['activate', 'deactivate', 'delete', 'invite']),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const { ids, action } = bulkActionSchema.parse(body)

    switch (action) {
      case 'activate': {
        const result = await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { isActive: true },
        })
        return NextResponse.json({ count: result.count, action: 'activate' })
      }

      case 'deactivate': {
        const result = await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false },
        })
        return NextResponse.json({ count: result.count, action: 'deactivate' })
      }

      case 'delete': {
        // Soft delete: disattiva i dipendenti
        const result = await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false },
        })
        return NextResponse.json({ count: result.count, action: 'delete' })
      }

      case 'invite': {
        // I dipendenti selezionati hanno già un account: l'invito abilita il portale
        // e spedisce un link per impostare la password (non una registrazione ex novo).
        const users = await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, email: true, firstName: true },
        })

        const invitedByName = [session.user.firstName, session.user.lastName]
          .filter(Boolean)
          .join(' ')
          .trim()

        let emailsSent = 0
        let emailsFailed = 0
        const missingEmail: string[] = []

        for (const user of users) {
          const token = crypto.randomBytes(32).toString('hex')
          const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

          await prisma.user.update({
            where: { id: user.id },
            data: {
              portalEnabled: true,
              mustChangePassword: true,
              resetToken: token,
              resetTokenExpiry: expiresAt,
            },
          })

          if (!user.email) {
            missingEmail.push(user.id)
            continue
          }

          // L'invio non deve bloccare il resto del batch
          const sent = await sendPortalAccessEmail({
            email: user.email,
            token,
            firstName: user.firstName,
            invitedByName: invitedByName || null,
          })

          if (sent) {
            emailsSent++
          } else {
            emailsFailed++
            logger.error('[StaffBulk] Invito creato ma invio email fallito', {
              userId: user.id,
            })
          }
        }

        if (missingEmail.length > 0) {
          logger.warn('[StaffBulk] Dipendenti senza email, invito non spedito', {
            userIds: missingEmail,
          })
        }

        return NextResponse.json({
          count: users.length,
          action: 'invite',
          emailsSent,
          emailsFailed,
          missingEmail: missingEmail.length,
        })
      }

      default:
        return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/staff/bulk', error)
    return NextResponse.json(
      { error: 'Errore nell\'esecuzione dell\'azione bulk' },
      { status: 500 }
    )
  }
}
