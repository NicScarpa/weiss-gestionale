import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// POST /api/chiusure/[id]/submit - Invia chiusura per validazione
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    // Verifica che la chiusura esista
    const closure = await prisma.dailyClosure.findUnique({
      where: { id },
      include: {
        stations: true,
      },
    })

    if (!closure) {
      return NextResponse.json(
        { error: 'Chiusura non trovata' },
        { status: 404 }
      )
    }

    // Verifica accesso
    if (
      session.user.role !== 'admin' &&
      session.user.venueId !== closure.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Solo DRAFT può essere inviata
    if (closure.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Solo le chiusure in bozza possono essere inviate' },
        { status: 400 }
      )
    }

    // Verifica che ci sia almeno una stazione
    if (closure.stations.length === 0) {
      return NextResponse.json(
        { error: 'La chiusura deve avere almeno una postazione cassa' },
        { status: 400 }
      )
    }

    // Aggiorna stato a SUBMITTED
    const updated = await prisma.dailyClosure.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedById: session.user.id,
        submittedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
      },
    })

    return NextResponse.json({
      ...updated,
      message: 'Chiusura inviata per validazione',
    })
  } catch (error) {
    logger.error('Errore POST /api/chiusure/[id]/submit', error)
    return NextResponse.json(
      { error: 'Errore nell\'invio della chiusura' },
      { status: 500 }
    )
  }
}
