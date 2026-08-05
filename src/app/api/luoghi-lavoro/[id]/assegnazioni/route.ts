import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { assegnazioneLuogoSchema } from '@/lib/validations/luoghi-lavoro'

async function guard() {
  const session = await auth()
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) }
  }
  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return { error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }

  return { session }
}

// POST /api/luoghi-lavoro/[id]/assegnazioni - Abilita un dipendente su un luogo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guard()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const luogo = await prisma.workLocation.findFirst({
      where: { id, venueId },
      select: { id: true, name: true },
    })

    if (!luogo) {
      return NextResponse.json({ error: 'Luogo non trovato' }, { status: 404 })
    }

    const body = await request.json()
    const dati = assegnazioneLuogoSchema.parse(body)

    // Riassegnare qualcuno già abilitato non crea un doppione: aggiorna la
    // modalità e riapre l'assegnazione se era stata chiusa.
    const assegnazione = await prisma.workLocationAssignment.upsert({
      where: {
        userId_workLocationId: { userId: dati.userId, workLocationId: id },
      },
      create: {
        userId: dati.userId,
        workLocationId: id,
        trackingMode: dati.trackingMode,
      },
      update: { trackingMode: dati.trackingMode, endedAt: null },
      select: {
        id: true,
        trackingMode: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    await createAuditLog({
      userId: session!.user.id,
      action: 'UPDATE',
      entityType: 'WorkLocationAssignment',
      entityId: assegnazione.id,
      venueId,
      newValues: {
        luogo: luogo.name,
        dipendente: `${assegnazione.user.firstName} ${assegnazione.user.lastName}`,
        modalita: assegnazione.trackingMode,
      },
    })

    return NextResponse.json({ data: assegnazione }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: err.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/luoghi-lavoro/[id]/assegnazioni', err)
    return NextResponse.json(
      { error: "Errore nell'assegnazione del dipendente" },
      { status: 500 }
    )
  }
}

// DELETE /api/luoghi-lavoro/[id]/assegnazioni?userId=... - Revoca l'abilitazione
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guard()
    if (error) return error

    const { id } = await params
    const userId = new URL(request.url).searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Dipendente non indicato' }, { status: 400 })
    }

    const venueId = await getVenueId()

    const assegnazione = await prisma.workLocationAssignment.findFirst({
      where: { userId, workLocationId: id, workLocation: { venueId } },
      select: { id: true },
    })

    if (!assegnazione) {
      return NextResponse.json({ error: 'Assegnazione non trovata' }, { status: 404 })
    }

    // Si chiude invece di cancellare: le timbrature già registrate su questo
    // luogo restano leggibili insieme alla modalità con cui furono raccolte.
    await prisma.workLocationAssignment.update({
      where: { id: assegnazione.id },
      data: { endedAt: new Date() },
    })

    await createAuditLog({
      userId: session!.user.id,
      action: 'UPDATE',
      entityType: 'WorkLocationAssignment',
      entityId: assegnazione.id,
      venueId,
      newValues: { endedAt: 'ora' },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Errore DELETE /api/luoghi-lavoro/[id]/assegnazioni', err)
    return NextResponse.json(
      { error: "Errore nella revoca dell'assegnazione" },
      { status: 500 }
    )
  }
}
