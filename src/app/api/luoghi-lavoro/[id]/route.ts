import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { badRequest, handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'
import { luogoLavoroSchema } from '@/lib/validations/luoghi-lavoro'
import { luogoSelect, RUOLI_CONFIGURAZIONE } from '../route'

type Params = { id: string }
const OPZIONI = { roles: RUOLI_CONFIGURAZIONE, venueScoped: true } as const

// PUT /api/luoghi-lavoro/[id]
export const PUT = withAuth<Params>(async (request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params

    const esistente = await prisma.workLocation.findFirst({
      where: { id, venueId },
      select: { id: true, name: true, geofenceRadiusMeters: true },
    })

    if (!esistente) {
      return notFound('Luogo non trovato')
    }

    const body = await request.json()
    const dati = luogoLavoroSchema.parse(body)

    // La regola oraria collegata deve esistere ed essere della stessa sede.
    if (dati.timekeepingPolicyId) {
      const regola = await prisma.timekeepingPolicy.findFirst({
        where: { id: dati.timekeepingPolicyId, venueId },
        select: { id: true },
      })

      if (!regola) {
        return badRequest('Regola orario non trovata')
      }
    }

    const luogo = await prisma.workLocation.update({
      where: { id },
      data: dati,
      select: luogoSelect,
    })

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'WorkLocation',
      entityId: id,
      venueId,
      oldValues: esistente,
      newValues: { name: luogo.name, geofenceRadiusMeters: luogo.geofenceRadiusMeters },
    })

    return ok({ data: luogo })
  } catch (err) {
    return handleApiError(
      err,
      'PUT /api/luoghi-lavoro/[id]',
      "Errore nell'aggiornamento del luogo di lavoro"
    )
  }
}, OPZIONI)

// DELETE /api/luoghi-lavoro/[id]
export const DELETE = withAuth<Params>(async (_request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params

    const luogo = await prisma.workLocation.findFirst({
      where: { id, venueId },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: { select: { attendanceRecords: true, assignments: true } },
      },
    })

    if (!luogo) {
      return notFound('Luogo non trovato')
    }

    // Un luogo su cui si è già timbrato non si cancella: le timbrature
    // resterebbero senza il posto in cui sono avvenute. Si disattiva, e
    // sparisce dalle scelte future senza intaccare lo storico.
    if (luogo._count.attendanceRecords > 0) {
      const disattivato = await prisma.workLocation.update({
        where: { id },
        data: { isActive: false },
        select: luogoSelect,
      })

      await createAuditLog({
        userId: user.id,
        action: 'UPDATE',
        entityType: 'WorkLocation',
        entityId: id,
        venueId,
        oldValues: { isActive: true },
        newValues: { isActive: false, motivo: 'disattivato al posto di eliminare' },
      })

      return ok({
        data: disattivato,
        message: `${luogo.name} ha timbrature registrate: è stato disattivato invece di essere eliminato.`,
      })
    }

    await prisma.workLocation.delete({ where: { id } })

    await createAuditLog({
      userId: user.id,
      action: 'DELETE',
      entityType: 'WorkLocation',
      entityId: id,
      venueId,
      oldValues: { name: luogo.name },
    })

    return ok({ success: true })
  } catch (err) {
    return handleApiError(
      err,
      'DELETE /api/luoghi-lavoro/[id]',
      "Errore nell'eliminazione del luogo di lavoro"
    )
  }
}, OPZIONI)
