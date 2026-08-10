import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyLeaveApproved } from '@/lib/notifications'
import { badRequest, handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'

type Params = { id: string }
const approveSchema = z.object({
  managerNotes: z.string().optional(),
})

// POST /api/leave-requests/[id]/approve - Approva richiesta
export const POST = withAuth<Params>(async (request: NextRequest, { params, user }) => {
  try {
    const { id } = params
    const body = await request.json()
    const { managerNotes } = approveSchema.parse(body)

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

    // Solo richieste PENDING possono essere approvate
    if (leaveRequest.status !== 'PENDING') {
      return badRequest('Solo le richieste in attesa possono essere approvate')
    }

    // Aggiorna richiesta
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        managerNotes: managerNotes || null,
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

    // Aggiorna saldo: sposta da pending a used
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
          used: { increment: days },
        },
      })
    }

    // Invia notifica al dipendente (async)
    notifyLeaveApproved(id).catch((err) =>
      logger.error('Errore invio notifica ferie approvate', err)
    )

    return ok({
      ...updated,
      message: 'Richiesta approvata',
    })
  } catch (error) {
    return handleApiError(
      error,
      'POST /api/leave-requests/[id]/approve',
      "Errore nell'approvazione della richiesta"
    )
  }
}, { roles: ['admin', 'manager'] })
