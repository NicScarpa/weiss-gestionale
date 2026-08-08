import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  badRequest,
  forbidden,
  handleApiError,
  notFound,
  ok,
  withAuth,
} from '@/lib/api-utils'

type Params = { id: string }
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
export const GET = withAuth<Params>(async (_request: NextRequest, { params, user }) => {
  try {
    const { id } = params

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
      return notFound('Richiesta non trovata')
    }

    // Staff può vedere solo le proprie richieste
    if (user.role === 'staff' && leaveRequest.userId !== user.id) {
      return forbidden()
    }

    return ok(leaveRequest)
  } catch (error) {
    return handleApiError(
      error,
      'GET /api/leave-requests/[id]',
      'Errore nel recupero della richiesta'
    )
  }
})

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
export const PUT = withAuth<Params>(async (request: NextRequest, { params }) => {
  try {
    const { id } = params
    const body = await request.json()
    const validatedData = updateLeaveRequestSchema.parse(body)

    // Recupera richiesta esistente
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { leaveType: true },
    })

    if (!existingRequest) {
      return notFound('Richiesta non trovata')
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

    return ok(updatedRequest)
  } catch (error) {
    return handleApiError(
      error,
      'PUT /api/leave-requests/[id]',
      'Errore nella modifica della richiesta'
    )
  }
}, { roles: ['admin'] })

// DELETE /api/leave-requests/[id] - Annulla richiesta
export const DELETE = withAuth<Params>(async (_request: NextRequest, { params, user }) => {
  try {
    const { id } = params

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        leaveType: true,
      },
    })

    if (!leaveRequest) {
      return notFound('Richiesta non trovata')
    }

    // Solo il richiedente o admin può annullare
    if (leaveRequest.userId !== user.id && user.role !== 'admin') {
      return forbidden()
    }

    // Non si può annullare se già approvata e passata (tranne admin)
    if (
      user.role !== 'admin' &&
      leaveRequest.status === 'APPROVED' &&
      new Date(leaveRequest.startDate) <= new Date()
    ) {
      return badRequest('Non puoi annullare una richiesta già iniziata o passata')
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

    return ok({ message: 'Richiesta annullata' })
  } catch (error) {
    return handleApiError(
      error,
      'DELETE /api/leave-requests/[id]',
      "Errore nell'annullamento della richiesta"
    )
  }
})
