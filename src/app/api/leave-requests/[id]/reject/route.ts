import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyLeaveRejected } from '@/lib/notifications'

import { logger } from '@/lib/logger'
const rejectSchema = z.object({
  rejectionReason: z.string().min(1, 'Il motivo del rifiuto è obbligatorio'),
})

// POST /api/leave-requests/[id]/reject - Rifiuta richiesta
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono rifiutare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
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
      return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
    }

    // Solo richieste PENDING possono essere rifiutate
    if (leaveRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Solo le richieste in attesa possono essere rifiutate' },
        { status: 400 }
      )
    }

    // Aggiorna richiesta
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason,
        approvedById: session.user.id, // Chi ha processato la richiesta
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

    return NextResponse.json({
      ...updated,
      message: 'Richiesta rifiutata',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/leave-requests/[id]/reject', error)
    return NextResponse.json(
      { error: 'Errore nel rifiuto della richiesta' },
      { status: 500 }
    )
  }
}
