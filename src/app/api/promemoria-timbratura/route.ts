import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { badRequest, created, handleApiError, ok, withAuth } from '@/lib/api-utils'
import { promemoriaTimbraturaSchema } from '@/lib/validations/promemoria-timbratura'

/** I promemoria scrivono sui telefoni di tutti: solo admin e manager. */
export const RUOLI_PROMEMORIA = ['admin', 'manager'] as const

/** Campi restituiti al client, uguali in lista e dopo il salvataggio. */
export const promemoriaSelect = {
  id: true,
  name: true,
  punchType: true,
  timeMinutes: true,
  daysOfWeek: true,
  skipIfPunched: true,
  title: true,
  body: true,
  isActive: true,
  lastSentDate: true,
  recipients: { select: { userId: true } },
} as const

/**
 * Chi può ricevere un promemoria: l'organico attivo con il portale acceso.
 * È lo stesso insieme che il cron usa quando il promemoria non ha destinatari
 * espliciti — se qui comparisse qualcun altro, si potrebbe scegliere una
 * persona che non riceverà mai nulla.
 */
function destinatariPossibili(venueId: string) {
  return prisma.user.findMany({
    where: { venueId, isActive: true, portalEnabled: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
}

/**
 * Verifica che i destinatari scelti siano davvero dipendenti della sede
 * abilitati al portale. Restituisce il messaggio d'errore, o `null` se va bene.
 */
export async function verificaDestinatari(
  recipientIds: string[],
  venueId: string
): Promise<string | null> {
  if (recipientIds.length === 0) return null

  const trovati = await prisma.user.count({
    where: {
      id: { in: recipientIds },
      venueId,
      isActive: true,
      portalEnabled: true,
    },
  })

  return trovati === recipientIds.length
    ? null
    : 'Fra i destinatari scelti c\'è qualcuno che non è un dipendente attivo con il portale abilitato'
}

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
