import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { promemoriaTimbraturaSchema } from '@/lib/validations/promemoria-timbratura'

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

export async function guardAdminManager() {
  const session = await auth()
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }),
    }
  }
  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return { error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }

  return { session }
}

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
export async function GET() {
  try {
    const { error } = await guardAdminManager()
    if (error) return error

    const venueId = await getVenueId()

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

    return NextResponse.json({ data: promemoria, dipendenti })
  } catch (error) {
    logger.error('Errore GET /api/promemoria-timbratura', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei promemoria' },
      { status: 500 }
    )
  }
}

// POST /api/promemoria-timbratura - Crea un promemoria
export async function POST(request: NextRequest) {
  try {
    const { session, error } = await guardAdminManager()
    if (error) return error

    const body = await request.json()
    const { recipientIds, ...campi } = promemoriaTimbraturaSchema.parse(body)
    const venueId = await getVenueId()

    const destinatariNonValidi = await verificaDestinatari(recipientIds, venueId)
    if (destinatariNonValidi) {
      return NextResponse.json({ error: destinatariNonValidi }, { status: 400 })
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
      userId: session!.user.id,
      action: 'CREATE',
      entityType: 'ClockReminder',
      entityId: promemoria.id,
      venueId,
      newValues: promemoria,
    })

    return NextResponse.json({ data: promemoria }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/promemoria-timbratura', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del promemoria' },
      { status: 500 }
    )
  }
}
