import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { romeDayRange, toDateOnlyUtc } from '@/lib/timezone'
import { comunicazioneSchema } from '@/lib/validations/comunicazioni'
import { comunicazioneSelect } from '@/lib/comunicazioni'

// PUT /api/comunicazioni/[id] - Corregge una comunicazione già pubblicata.
// Non rimanda la push: chi l'ha già ricevuta non va avvisato due volte per una
// correzione di testo.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    const esistente = await prisma.communication.findFirst({
      where: { id, venueId },
      select: {
        id: true,
        title: true,
        message: true,
        priority: true,
        targetRoles: true,
      },
    })

    if (!esistente) {
      return NextResponse.json(
        { error: 'Comunicazione non trovata' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const dati = comunicazioneSchema.parse(body)

    const comunicazione = await prisma.communication.update({
      where: { id },
      data: {
        title: dati.title,
        message: dati.message,
        priority: dati.priority,
        eventDate: dati.eventDate ? toDateOnlyUtc(dati.eventDate) : null,
        expiresAt: dati.expiresAt ? romeDayRange(dati.expiresAt).end : null,
        targetRoles: dati.targetRoles,
      },
      select: comunicazioneSelect,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Communication',
      entityId: id,
      venueId,
      oldValues: {
        title: esistente.title,
        priority: esistente.priority,
        targetRoles: esistente.targetRoles,
      },
      newValues: {
        title: dati.title,
        priority: dati.priority,
        targetRoles: dati.targetRoles,
      },
    })

    return NextResponse.json({ data: comunicazione })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/comunicazioni/[id]', error)
    return NextResponse.json(
      { error: 'Errore nella modifica della comunicazione' },
      { status: 500 }
    )
  }
}

// DELETE /api/comunicazioni/[id] - Ritira una comunicazione.
// Qui si cancella davvero: una comunicazione ritirata non lascia nulla da
// ricostruire, e le letture cadono in cascata.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    const esistente = await prisma.communication.findFirst({
      where: { id, venueId },
      select: { id: true, title: true, priority: true },
    })

    if (!esistente) {
      return NextResponse.json(
        { error: 'Comunicazione non trovata' },
        { status: 404 }
      )
    }

    await prisma.communication.delete({ where: { id } })

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'Communication',
      entityId: id,
      venueId,
      oldValues: { title: esistente.title, priority: esistente.priority },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/comunicazioni/[id]', error)
    return NextResponse.json(
      { error: "Errore nell'eliminazione della comunicazione" },
      { status: 500 }
    )
  }
}
