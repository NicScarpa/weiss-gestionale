import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/portal/colleagues - Lista colleghi della stessa sede
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')

    // Usa la sede dell'utente corrente se non specificata
    const targetVenueId = venueId || session.user.venueId

    if (!targetVenueId) {
      return NextResponse.json({ error: 'Sede non specificata' }, { status: 400 })
    }

    // Recupera i colleghi della stessa sede (escluso l'utente corrente)
    const colleagues = await prisma.user.findMany({
      where: {
        venueId: targetVenueId,
        id: { not: session.user.id },
        role: { name: 'staff' }, // Solo staff, non manager o admin
        isActive: true,
        portalEnabled: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    })

    return NextResponse.json({ data: colleagues })
  } catch (error) {
    logger.error('Errore GET /api/portal/colleagues', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei colleghi' },
      { status: 500 }
    )
  }
}
