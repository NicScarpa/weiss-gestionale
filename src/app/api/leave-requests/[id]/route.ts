import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per modifica richiesta (solo admin)
const updateLeaveRequestSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  leaveTypeId: z.string().optional(),
  notes: z.string().optional().nullable(),
  isPartialDay: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
})

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

    return NextResponse.json(leaveRequest)
  } catch (error) {
    logger.error('Errore GET /api/leave-requests/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della richiesta' },
      { status: 500 }
    )
  }
}

// Calcola giorni lavorativi tra due date (esclude weekend)
function calculateWorkingDays(start: Date, end: Date): number {
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

// PUT /api/leave-requests/[id] - Modifica richiesta (solo admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può modificare richieste
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Solo gli admin possono modificare le richieste' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = updateLeaveRequestSchema.parse(body)

    // Recupera richiesta esistente
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { leaveType: true },
    })

    if (!existingRequest) {
      return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
    }

    // Prepara dati aggiornamento
    const updateData: Record<string, unknown> = {}

    // Se cambiano le date, ricalcola giorni
    let newStartDate = existingRequest.startDate
    let newEndDate = existingRequest.endDate
    let newLeaveTypeId = existingRequest.leaveTypeId

    if (validatedData.startDate) {
      newStartDate = new Date(validatedData.startDate)
      updateData.startDate = newStartDate
    }
    if (validatedData.endDate) {
      newEndDate = new Date(validatedData.endDate)
      updateData.endDate = newEndDate
    }
    if (validatedData.leaveTypeId) {
      newLeaveTypeId = validatedData.leaveTypeId
      updateData.leaveTypeId = newLeaveTypeId
    }
    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes
    }
    if (validatedData.isPartialDay !== undefined) {
      updateData.isPartialDay = validatedData.isPartialDay
    }
    if (validatedData.startTime !== undefined) {
      updateData.startTime = validatedData.startTime
    }
    if (validatedData.endTime !== undefined) {
      updateData.endTime = validatedData.endTime
    }

    // Ricalcola giorni se cambiate le date
    if (validatedData.startDate || validatedData.endDate) {
      const newDaysRequested = calculateWorkingDays(newStartDate, newEndDate)
      updateData.daysRequested = newDaysRequested

      // Aggiorna saldo se era approvata
      if (existingRequest.status === 'APPROVED') {
        const oldDays = Number(existingRequest.daysRequested) || 0
        const diffDays = newDaysRequested - oldDays
        const year = newStartDate.getFullYear()

        if (diffDays !== 0) {
          await prisma.leaveBalance.updateMany({
            where: {
              userId: existingRequest.userId,
              leaveTypeId: existingRequest.leaveTypeId,
              year,
            },
            data: {
              used: { increment: diffDays },
            },
          })
        }
      }
    }

    // Se cambia tipo assenza e era approvata, aggiorna saldi
    if (validatedData.leaveTypeId && validatedData.leaveTypeId !== existingRequest.leaveTypeId && existingRequest.status === 'APPROVED') {
      const days = Number(existingRequest.daysRequested) || 0
      const year = existingRequest.startDate.getFullYear()

      // Decrementa dal vecchio tipo
      await prisma.leaveBalance.updateMany({
        where: {
          userId: existingRequest.userId,
          leaveTypeId: existingRequest.leaveTypeId,
          year,
        },
        data: {
          used: { decrement: days },
        },
      })

      // Incrementa nel nuovo tipo
      await prisma.leaveBalance.updateMany({
        where: {
          userId: existingRequest.userId,
          leaveTypeId: validatedData.leaveTypeId,
          year,
        },
        data: {
          used: { increment: days },
        },
      })
    }

    // Aggiorna richiesta
    const updatedRequest = await prisma.leaveRequest.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: true,
      },
    })

    return NextResponse.json(updatedRequest)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }
    logger.error('Errore PUT /api/leave-requests/[id]', error)
    return NextResponse.json(
      { error: 'Errore nella modifica della richiesta' },
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

    // Non si può annullare se già approvata e passata (tranne admin)
    if (
      session.user.role !== 'admin' &&
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
    logger.error('Errore DELETE /api/leave-requests/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'annullamento della richiesta' },
      { status: 500 }
    )
  }
}
