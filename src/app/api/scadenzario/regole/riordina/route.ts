import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
})

// PATCH /api/scadenzario/regole/riordina - Riordina batch
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const { orderedIds } = reorderSchema.parse(body)

    const venueId = await getVenueId()

    // Verifica che tutte le regole esistano e appartengano alla stessa venue/direzione
    const rules = await prisma.scheduleRule.findMany({
      where: { id: { in: orderedIds } },
      select: { id: true, venueId: true, direzione: true },
    })

    if (rules.length !== orderedIds.length) {
      return NextResponse.json(
        { error: 'Una o più regole non trovate' },
        { status: 404 }
      )
    }

    const directions = new Set(rules.map(r => r.direzione))
    const venues = new Set(rules.map(r => r.venueId))

    if (directions.size > 1 || venues.size > 1) {
      return NextResponse.json(
        { error: 'Tutte le regole devono appartenere alla stessa venue e direzione' },
        { status: 400 }
      )
    }

    if (!venues.has(venueId)) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    // Aggiorna ordini in transazione
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.scheduleRule.update({
          where: { id },
          data: { ordine: index },
        })
      )
    )

    // Ritorna le regole aggiornate
    const updatedRules = await prisma.scheduleRule.findMany({
      where: { id: { in: orderedIds } },
      orderBy: { ordine: 'asc' },
      include: {
        conto: {
          select: { id: true, code: true, name: true, type: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    return NextResponse.json({ data: updatedRules })
  } catch (error) {
    logger.error('Errore PATCH /api/scadenzario/regole/riordina', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nel riordino delle regole' },
      { status: 500 }
    )
  }
}
