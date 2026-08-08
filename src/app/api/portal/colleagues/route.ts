import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, ok, withAuth } from '@/lib/api-utils'

// GET /api/portal/colleagues - Lista colleghi della stessa sede
//
// La sede arriva dalla sessione, non più dalla query string: prima bastava
// aggiungere `?venueId=` per spostare la lettura su un'altra sede.
export const GET = withAuth(
  async (_request: NextRequest, { user, venueId }) => {
    try {
      const colleagues = await prisma.user.findMany({
        where: {
          venueId,
          id: { not: user.id },
          role: { name: 'staff' }, // Solo staff, non manager o admin
          isActive: true,
          portalEnabled: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })

      return ok({ data: colleagues })
    } catch (error) {
      return handleApiError(
        error,
        'GET /api/portal/colleagues',
        'Errore nel recupero dei colleghi'
      )
    }
  },
  { venueScoped: true }
)
