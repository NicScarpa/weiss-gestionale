import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { politicaOrarioSchema } from '@/lib/validations/politiche-orario'

/** Campi restituiti al client, uguali in lista e in dettaglio. */
export const politicaSelect = {
  id: true,
  name: true,
  isDefault: true,
  isActive: true,
  dayStartMinutes: true,
  dayEndMinutes: true,
  lunchStartMinutes: true,
  lunchEndMinutes: true,
  flexMinutes: true,
  roundingMinutes: true,
  roundingToleranceMinutes: true,
  roundingOutMinutes: true,
  roundingOutToleranceMinutes: true,
  maxDailyMinutes: true,
  contractWeeklyHours: true,
  saturdayAsOvertime: true,
  blockSunday: true,
  singlePunchMode: true,
  useShiftAsWindow: true,
  createdAt: true,
  updatedAt: true,
  extraBreaks: {
    select: { id: true, name: true, startMinutes: true, endMinutes: true },
    orderBy: { startMinutes: 'asc' },
  },
  // Il conteggio deve combaciare con la guardia dell'eliminazione, che conta
  // dipendenti E luoghi: mostrare solo i dipendenti fa cercare assegnazioni
  // che non esistono.
  _count: { select: { users: true, workLocations: true } },
} as const

// GET /api/politiche-orario - Elenco delle regole orario
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()

    const politiche = await prisma.timekeepingPolicy.findMany({
      where: { venueId },
      select: politicaSelect,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ data: politiche })
  } catch (error) {
    logger.error('Errore GET /api/politiche-orario', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle regole orario' },
      { status: 500 }
    )
  }
}

// POST /api/politiche-orario - Crea una regola orario
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const dati = politicaOrarioSchema.parse(body)
    const venueId = await getVenueId()

    const { extraBreaks, ...campi } = dati

    // Una sola regola predefinita per volta: il vincolo non è esprimibile nello
    // schema, quindi si applica qui, dentro la transazione che crea la regola.
    const politica = await prisma.$transaction(async (tx) => {
      if (campi.isDefault) {
        await tx.timekeepingPolicy.updateMany({
          where: { venueId, isDefault: true },
          data: { isDefault: false },
        })
      }

      return tx.timekeepingPolicy.create({
        data: {
          ...campi,
          venueId,
          extraBreaks: { create: extraBreaks },
        },
        select: politicaSelect,
      })
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'TimekeepingPolicy',
      entityId: politica.id,
      venueId,
      newValues: politica,
    })

    return NextResponse.json({ data: politica }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/politiche-orario', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della regola orario' },
      { status: 500 }
    )
  }
}
