import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { badRequest, created, handleApiError, ok, withAuth } from '@/lib/api-utils'
import { luogoLavoroSchema } from '@/lib/validations/luoghi-lavoro'
import { luogoSelect, RUOLI_CONFIGURAZIONE } from './condiviso'

// GET /api/luoghi-lavoro - Elenco dei luoghi di lavoro
export const GET = withAuth(
  async (_request: NextRequest, { venueId }) => {
    try {
      const luoghi = await prisma.workLocation.findMany({
        where: { venueId },
        select: luogoSelect,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      })

      return ok({ data: luoghi })
    } catch (error) {
      return handleApiError(
        error,
        'GET /api/luoghi-lavoro',
        'Errore nel recupero dei luoghi di lavoro'
      )
    }
  },
  { roles: RUOLI_CONFIGURAZIONE, venueScoped: true }
)

// POST /api/luoghi-lavoro - Crea un luogo di lavoro
export const POST = withAuth(
  async (request: NextRequest, { user, venueId }) => {
    try {
      const dati = luogoLavoroSchema.parse(await request.json())

      // La regola oraria collegata deve esistere ed essere della stessa sede:
      // un id qualsiasi cambierebbe il calcolo delle ore di chi timbra qui.
      if (dati.timekeepingPolicyId) {
        const regola = await prisma.timekeepingPolicy.findFirst({
          where: { id: dati.timekeepingPolicyId, venueId },
          select: { id: true },
        })

        if (!regola) {
          return badRequest('Regola orario non trovata')
        }
      }

      const luogo = await prisma.workLocation.create({
        data: { ...dati, venueId },
        select: luogoSelect,
      })

      await createAuditLog({
        userId: user.id,
        action: 'CREATE',
        entityType: 'WorkLocation',
        entityId: luogo.id,
        venueId,
        newValues: { name: luogo.name, address: luogo.address },
      })

      return created({ data: luogo })
    } catch (error) {
      return handleApiError(
        error,
        'POST /api/luoghi-lavoro',
        'Errore nella creazione del luogo di lavoro'
      )
    }
  },
  { roles: RUOLI_CONFIGURAZIONE, venueScoped: true }
)
