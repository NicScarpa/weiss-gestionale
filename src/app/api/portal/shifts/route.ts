import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, ok, withAuth } from '@/lib/api-utils'
import type { Prisma } from '@prisma/client'

// GET /api/portal/shifts - Turni personali dipendente
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const { searchParams } = request.nextUrl
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : undefined

    const whereClause: Prisma.ShiftAssignmentWhereInput = {
      // Sempre e solo i propri: l'id viene dalla sessione, non dalla richiesta.
      userId: user.id,
      // Solo turni da schedule pubblicati
      schedule: { status: 'PUBLISHED' },
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: whereClause,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
        status: true,
        swapStatus: true,
        swapRequestedById: true,
        swapWithUserId: true,
        notes: true,
        shiftDefinition: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        schedule: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      ...(limit && { take: limit }),
    })

    return ok({ data: assignments })
  } catch (error) {
    return handleApiError(error, 'GET /api/portal/shifts', 'Errore nel recupero dei turni')
  }
})
