import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, ok, withAuth } from '@/lib/api-utils'

// GET /api/leave-types - Lista tipi assenza
// Basta essere autenticati: l'elenco serve a chiunque debba chiedere ferie o
// permessi, e non contiene dati di nessuno.
export const GET = withAuth(async (request: NextRequest) => {
  try {
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'

    const leaveTypes = await prisma.leaveType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ code: 'asc' }],
    })

    return ok({ data: leaveTypes })
  } catch (error) {
    return handleApiError(
      error,
      'GET /api/leave-types',
      'Errore nel recupero dei tipi assenza'
    )
  }
})
