import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
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

    // Il dipendente deve esistere, essere attivo e della stessa sede: un id
    // qualsiasi finirebbe dritto nella foreign key con un 500 opaco.
    const dipendente = await prisma.user.findFirst({
      where: { id: dati.userId, isActive: true, ...(venueId && { venueId }) },
      select: { id: true },
    })

    if (!dipendente) {
      return NextResponse.json(
        { error: 'Dipendente non trovato' },
        { status: 400 }
      )
    }

    // Riassegnare qualcuno già abilitato non crea un doppione: aggiorna la
    // modalità e riapre l'assegnazione se era stata chiusa.
    const selezione = {
      id: true,
      trackingMode: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    } as const

    const argomenti = {
      where: {
        userId_workLocationId: { userId: dati.userId, workLocationId: id },
      },
      create: {
        userId: dati.userId,
        workLocationId: id,
        trackingMode: dati.trackingMode,
      },
      update: { trackingMode: dati.trackingMode, endedAt: null },
      select: selezione,
    }

    let assegnazione
    try {
      assegnazione = await prisma.workLocationAssignment.upsert(argomenti)
    } catch (err) {
      // L'upsert di Prisma non è atomico: due richieste simultanee sulla
      // stessa coppia fanno fallire la seconda sul vincolo di unicità. A quel
      // punto la riga esiste: si ritenta una volta e va in aggiornamento.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        assegnazione = await prisma.workLocationAssignment.upsert(argomenti)
      } else {
        throw err
      }
    }

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
