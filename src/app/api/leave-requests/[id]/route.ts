import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/leave-requests/[id] - Dettaglio richiesta
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            venue: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        leaveType: true,
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!leaveRequest) {
      return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
    }

    // Staff può vedere solo le proprie richieste
    if (
      session.user.role === 'staff' &&
      leaveRequest.userId !== session.user.id
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Manager può vedere solo richieste della propria sede
    if (
      session.user.role === 'manager' &&
      leaveRequest.user.venue?.id !== session.user.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    return NextResponse.json(leaveRequest)
  } catch (error) {
    console.error('Errore GET /api/leave-requests/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della richiesta' },
      { status: 500 }
    )
  }
}

// DELETE /api/leave-requests/[id] - Annulla richiesta
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        leaveType: true,
      },
    })

    if (!leaveRequest) {
      return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
    }

    // Solo il richiedente o admin può annullare
    if (
      leaveRequest.userId !== session.user.id &&
      session.user.role !== 'admin'
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Non si può annullare se già approvata e passata
    if (
      leaveRequest.status === 'APPROVED' &&
      new Date(leaveRequest.startDate) <= new Date()
    ) {
      return NextResponse.json(
        { error: 'Non puoi annullare una richiesta già iniziata o passata' },
        { status: 400 }
      )
    }

    // Aggiorna stato a CANCELLED
    await prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    // Ripristina saldo
    const year = new Date(leaveRequest.startDate).getFullYear()
    const days = leaveRequest.daysRequested ? Number(leaveRequest.daysRequested) : 0

    if (days > 0) {
      if (leaveRequest.status === 'APPROVED') {
        await prisma.leaveBalance.updateMany({
          where: {
            userId: leaveRequest.userId,
            leaveTypeId: leaveRequest.leaveTypeId,
            year,
          },
          data: {
            used: { decrement: days },
          },
        })
      } else if (leaveRequest.status === 'PENDING') {
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
    }

    return NextResponse.json({ message: 'Richiesta annullata' })
  } catch (error) {
    console.error('Errore DELETE /api/leave-requests/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'annullamento della richiesta' },
      { status: 500 }
    )
  }
}
