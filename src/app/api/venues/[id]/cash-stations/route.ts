import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/venues/[id]/cash-stations - Template postazioni cassa per sede
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

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

    // Verifica accesso (stessa sede o admin)
    if (session.user.role !== 'admin' && session.user.venueId !== id) {
      return NextResponse.json(
        { error: 'Accesso non autorizzato' },
        { status: 403 }
      )
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
}
