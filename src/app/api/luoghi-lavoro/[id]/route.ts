import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { luogoLavoroSchema } from '@/lib/validations/luoghi-lavoro'
import { luogoSelect } from '../route'

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

// PUT /api/luoghi-lavoro/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guard()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const esistente = await prisma.workLocation.findFirst({
      where: { id, venueId },
      select: { id: true, name: true, geofenceRadiusMeters: true },
    })

    if (!esistente) {
      return NextResponse.json({ error: 'Luogo non trovato' }, { status: 404 })
    }

    const body = await request.json()
    const dati = luogoLavoroSchema.parse(body)

    // La regola oraria collegata deve esistere ed essere della stessa sede.
    if (dati.timekeepingPolicyId) {
      const regola = await prisma.timekeepingPolicy.findFirst({
        where: { id: dati.timekeepingPolicyId, venueId },
        select: { id: true },
      })

      if (!regola) {
        return NextResponse.json(
          { error: 'Regola orario non trovata' },
          { status: 400 }
        )
      }
    }

    const luogo = await prisma.workLocation.update({
      where: { id },
      data: dati,
      select: luogoSelect,
    })

    await createAuditLog({
      userId: session!.user.id,
      action: 'UPDATE',
      entityType: 'WorkLocation',
      entityId: id,
      venueId,
      oldValues: esistente,
      newValues: { name: luogo.name, geofenceRadiusMeters: luogo.geofenceRadiusMeters },
    })

    return NextResponse.json({ data: luogo })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: err.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/luoghi-lavoro/[id]', err)
    return NextResponse.json(
      { error: "Errore nell'aggiornamento del luogo di lavoro" },
      { status: 500 }
    )
  }
}

// DELETE /api/luoghi-lavoro/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guard()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const luogo = await prisma.workLocation.findFirst({
      where: { id, venueId },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: { select: { attendanceRecords: true, assignments: true } },
      },
    })

    if (!luogo) {
      return NextResponse.json({ error: 'Luogo non trovato' }, { status: 404 })
    }

    // Un luogo su cui si è già timbrato non si cancella: le timbrature
    // resterebbero senza il posto in cui sono avvenute. Si disattiva, e
    // sparisce dalle scelte future senza intaccare lo storico.
    if (luogo._count.attendanceRecords > 0) {
      const disattivato = await prisma.workLocation.update({
        where: { id },
        data: { isActive: false },
        select: luogoSelect,
      })

      await createAuditLog({
        userId: session!.user.id,
        action: 'UPDATE',
        entityType: 'WorkLocation',
        entityId: id,
        venueId,
        oldValues: { isActive: true },
        newValues: { isActive: false, motivo: 'disattivato al posto di eliminare' },
      })

      return NextResponse.json({
        data: disattivato,
        message: `${luogo.name} ha timbrature registrate: è stato disattivato invece di essere eliminato.`,
      })
    }

    await prisma.workLocation.delete({ where: { id } })

    await createAuditLog({
      userId: session!.user.id,
      action: 'DELETE',
      entityType: 'WorkLocation',
      entityId: id,
      venueId,
      oldValues: { name: luogo.name },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Errore DELETE /api/luoghi-lavoro/[id]', err)
    return NextResponse.json(
      { error: "Errore nell'eliminazione del luogo di lavoro" },
      { status: 500 }
    )
  }
}
