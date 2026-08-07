import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth, forbidden } from '@/lib/api-utils'

import { logger } from '@/lib/logger'
// GET /api/venues/[id]/cash-stations - Template postazioni cassa per sede
export const GET = withAuth<{ id: string }>(
  async (request, { params, venueId }) => {
  try {
    const { id } = params

    // La sede della sessione è l'unica interrogabile: l'id nell'URL può solo
    // confermarla, non sceglierne un'altra.
    if (id !== venueId) {
      return forbidden('Non hai accesso a questa sede')
    }

    // Verifica che la sede esista
    const venue = await prisma.venue.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        vatRate: true,
        defaultFloat: true,
      },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    // Recupera template postazioni cassa
    const cashStationTemplates = await prisma.cashStationTemplate.findMany({
      where: {
        venueId: id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        position: true,
      },
      orderBy: {
        position: 'asc',
      },
    })

    return NextResponse.json({
      venue,
      cashStations: cashStationTemplates,
    })
  } catch (error) {
    logger.error('Errore GET /api/venues/[id]/cash-stations', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle postazioni' },
      { status: 500 }
    )
  }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
