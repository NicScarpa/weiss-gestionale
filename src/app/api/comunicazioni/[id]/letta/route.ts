import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
import { filtroVisibili } from '@/lib/comunicazioni'

// POST /api/comunicazioni/[id]/letta - L'utente ha letto la comunicazione.
//
// Il portale la chiama all'apertura della bacheca, quindi deve essere
// idempotente: la seconda chiamata non sposta il momento della prima lettura.
// Non produce audit log: è un gesto di consultazione, ripetuto a ogni
// apertura, e riempirebbe il registro senza dire nulla.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    // Solo le comunicazioni che l'utente può davvero vedere: contare come
    // "letta" una comunicazione destinata ad altri falserebbe il conteggio
    // che i responsabili leggono nella dashboard.
    const comunicazione = await prisma.communication.findFirst({
      where: { id, venueId, ...filtroVisibili(session.user.role || '') },
      select: { id: true },
    })

    if (!comunicazione) {
      return NextResponse.json(
        { error: 'Comunicazione non trovata' },
        { status: 404 }
      )
    }

    await prisma.communicationRead.upsert({
      where: {
        communicationId_userId: { communicationId: id, userId: session.user.id },
      },
      create: { communicationId: id, userId: session.user.id },
      update: {},
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore POST /api/comunicazioni/[id]/letta', error)
    return NextResponse.json(
      { error: 'Errore nel segnare la comunicazione come letta' },
      { status: 500 }
    )
  }
}
