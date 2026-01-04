import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const approveSchema = z.object({
  managerNotes: z.string().optional(),
})

// POST /api/leave-requests/[id]/approve - Approva richiesta
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono approvare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
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
      return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
    }

    // Manager può approvare solo richieste della propria sede
    if (
      session.user.role === 'manager' &&
      leaveRequest.user.venueId !== session.user.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Solo richieste PENDING possono essere approvate
    if (leaveRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Solo le richieste in attesa possono essere approvate' },
        { status: 400 }
      )
    }

    // Aggiorna richiesta
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: session.user.id,
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

    // TODO: Inviare notifica al dipendente

    return NextResponse.json({
      ...updated,
      message: 'Richiesta approvata',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/leave-requests/[id]/approve:', error)
    return NextResponse.json(
      { error: 'Errore nell\'approvazione della richiesta' },
      { status: 500 }
    )
  }
}
