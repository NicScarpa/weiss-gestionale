import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { badRequest, handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'
import { promemoriaTimbraturaSchema } from '@/lib/validations/promemoria-timbratura'
import { promemoriaSelect, RUOLI_PROMEMORIA, verificaDestinatari } from '../route'

type Params = { id: string }
const OPZIONI = { roles: RUOLI_PROMEMORIA, venueScoped: true } as const

// La lettura del singolo promemoria non esiste: la lista di
// GET /api/promemoria-timbratura porta già tutti i campi, e il form di modifica
// parte da quelli.

// PUT /api/promemoria-timbratura/[id]
export const PUT = withAuth<Params>(async (request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params

    const esistente = await prisma.clockReminder.findFirst({
      where: { id, venueId },
      select: promemoriaSelect,
    })

    if (!esistente) {
      return notFound('Promemoria non trovato')
    }

    const body = await request.json()
    const { recipientIds, ...campi } = promemoriaTimbraturaSchema.parse(body)

    const destinatariNonValidi = await verificaDestinatari(recipientIds, venueId)
    if (destinatariNonValidi) {
      return badRequest(destinatariNonValidi)
    }

    const promemoria = await prisma.$transaction(async (tx) => {
      // I destinatari si riscrivono per intero: sono un elenco senza identità
      // propria fuori dal promemoria che li contiene.
      await tx.clockReminderRecipient.deleteMany({ where: { reminderId: id } })

      return tx.clockReminder.update({
        where: { id },
        data: {
          ...campi,
          recipients: { create: recipientIds.map((userId) => ({ userId })) },
        },
        select: promemoriaSelect,
      })
    })

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'ClockReminder',
      entityId: id,
      venueId,
      oldValues: esistente,
      newValues: promemoria,
    })

    return ok({ data: promemoria })
  } catch (err) {
    return handleApiError(
      err,
      'PUT /api/promemoria-timbratura/[id]',
      "Errore nell'aggiornamento del promemoria"
    )
  }
}, OPZIONI)

// DELETE /api/promemoria-timbratura/[id]
export const DELETE = withAuth<Params>(async (_request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params

    const promemoria = await prisma.clockReminder.findFirst({
      where: { id, venueId },
      select: promemoriaSelect,
    })

    if (!promemoria) {
      return notFound('Promemoria non trovato')
    }

    // I destinatari se ne vanno con lui (onDelete: Cascade nello schema).
    await prisma.clockReminder.delete({ where: { id } })

    await createAuditLog({
      userId: user.id,
      action: 'DELETE',
      entityType: 'ClockReminder',
      entityId: id,
      venueId,
      oldValues: promemoria,
    })

    return ok({ success: true })
  } catch (err) {
    return handleApiError(
      err,
      'DELETE /api/promemoria-timbratura/[id]',
      "Errore nell'eliminazione del promemoria"
    )
  }
}, OPZIONI)
