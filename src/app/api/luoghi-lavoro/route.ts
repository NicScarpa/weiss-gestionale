import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { luogoLavoroSchema } from '@/lib/validations/luoghi-lavoro'

export const luogoSelect = {
  id: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  geofenceRadiusMeters: true,
  isActive: true,
  timekeepingPolicyId: true,
  timekeepingPolicy: { select: { id: true, name: true } },
  assignments: {
    where: { endedAt: null },
    select: {
      id: true,
      trackingMode: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const

// GET /api/luoghi-lavoro - Elenco dei luoghi di lavoro
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

    const luoghi = await prisma.workLocation.findMany({
      where: { venueId },
      select: luogoSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ data: luoghi })
  } catch (error) {
    logger.error('Errore GET /api/luoghi-lavoro', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei luoghi di lavoro' },
      { status: 500 }
    )
  }
}

// POST /api/luoghi-lavoro - Crea un luogo di lavoro
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
    const dati = luogoLavoroSchema.parse(body)
    const venueId = await getVenueId()

    // La regola oraria collegata deve esistere ed essere della stessa sede:
    // un id qualsiasi cambierebbe il calcolo delle ore di chi timbra qui.
    if (dati.timekeepingPolicyId) {
      const regola = await prisma.timekeepingPolicy.findFirst({
        where: { id: dati.timekeepingPolicyId, ...(venueId && { venueId }) },
        select: { id: true },
      })

      if (!regola) {
        return NextResponse.json(
          { error: 'Regola orario non trovata' },
          { status: 400 }
        )
      }
    }

    const luogo = await prisma.workLocation.create({
      data: { ...dati, venueId },
      select: luogoSelect,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'WorkLocation',
      entityId: luogo.id,
      venueId,
      newValues: { name: luogo.name, address: luogo.address },
    })

    return NextResponse.json({ data: luogo }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/luoghi-lavoro', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del luogo di lavoro' },
      { status: 500 }
    )
  }
}
