import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyLeaveRejected } from '@/lib/notifications'
import { badRequest, handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'

type Params = { id: string }
const rejectSchema = z.object({
  rejectionReason: z.string().min(1, 'Il motivo del rifiuto è obbligatorio'),
})

// POST /api/leave-requests/[id]/reject - Rifiuta richiesta
export const POST = withAuth<Params>(async (request: NextRequest, { params, user }) => {
  try {
    const { id } = params
    const body = await request.json()
    const { rejectionReason } = rejectSchema.parse(body)

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            venueId: true,
          },
        },
        leaveType: true,
      },
    })

    if (!leaveRequest) {
      return notFound('Richiesta non trovata')
    }

    // Solo richieste PENDING possono essere rifiutate
    if (leaveRequest.status !== 'PENDING') {
      return badRequest('Solo le richieste in attesa possono essere rifiutate')
    }

    // Aggiorna richiesta
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason,
        approvedById: user.id, // Chi ha processato la richiesta
        approvedAt: new Date(),
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    // Ripristina saldo pending
    const year = new Date(leaveRequest.startDate).getFullYear()
    const days = leaveRequest.daysRequested ? Number(leaveRequest.daysRequested) : 0

    if (days > 0 && leaveRequest.leaveType.affectsAccrual) {
      await prisma.leaveBalance.updateMany({
        where: {
          userId: leaveRequest.userId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
        data: {
          pending: { decrement: days },
        },
      })
    }

    // Invia notifica al dipendente (async)
    notifyLeaveRejected(id, rejectionReason).catch((err) =>
      logger.error('Errore invio notifica ferie rifiutate', err)
    )

    return ok({
      ...updated,
      message: 'Richiesta rifiutata',
    })
  } catch (error) {
    return handleApiError(
      error,
      'POST /api/leave-requests/[id]/reject',
      'Errore nel rifiuto della richiesta'
    )
  }
}, { roles: ['admin', 'manager'] })
