import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { badRequest, created, handleApiError, ok, withAuth } from '@/lib/api-utils'
import { promemoriaTimbraturaSchema } from '@/lib/validations/promemoria-timbratura'
import {
  destinatariPossibili,
  promemoriaSelect,
  RUOLI_PROMEMORIA,
  verificaDestinatari,
} from './condiviso'

// GET /api/promemoria-timbratura - Elenco dei promemoria e destinatari possibili
export const GET = withAuth(async (_request: NextRequest, { venueId }) => {
  try {
    // I dipendenti viaggiano insieme ai promemoria perché la schermata serve
    // solo a scegliere fra loro: due chiamate separate mostrerebbero per un
    // istante un elenco di destinatari vuoto.
    const [promemoria, dipendenti] = await Promise.all([
      prisma.clockReminder.findMany({
        where: { venueId },
        select: promemoriaSelect,
        orderBy: [{ timeMinutes: 'asc' }, { name: 'asc' }],
      }),
      destinatariPossibili(venueId),
    ])

    return ok({ data: promemoria, dipendenti })
  } catch (error) {
    return handleApiError(
      error,
      'GET /api/promemoria-timbratura',
      'Errore nel recupero dei promemoria'
    )
  }
}, { roles: RUOLI_PROMEMORIA, venueScoped: true })

// POST /api/promemoria-timbratura - Crea un promemoria
export const POST = withAuth(async (request: NextRequest, { user, venueId }) => {
  try {
    const body = await request.json()
    const { recipientIds, ...campi } = promemoriaTimbraturaSchema.parse(body)

    const destinatariNonValidi = await verificaDestinatari(recipientIds, venueId)
    if (destinatariNonValidi) {
      return badRequest(destinatariNonValidi)
    }

    const promemoria = await prisma.clockReminder.create({
      data: {
        ...campi,
        venueId,
        recipients: { create: recipientIds.map((userId) => ({ userId })) },
      },
      select: promemoriaSelect,
    })

    await createAuditLog({
      userId: user.id,
      action: 'CREATE',
      entityType: 'ClockReminder',
      entityId: promemoria.id,
      venueId,
      newValues: promemoria,
    })

    return created({ data: promemoria })
  } catch (error) {
    return handleApiError(
      error,
      'POST /api/promemoria-timbratura',
      'Errore nella creazione del promemoria'
    )
  }
}, { roles: RUOLI_PROMEMORIA, venueScoped: true })
