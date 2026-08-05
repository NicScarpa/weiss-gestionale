import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { politicaOrarioSchema } from '@/lib/validations/politiche-orario'
import { politicaSelect } from '../route'

async function guard() {
  const session = await auth()
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }),
    }
  }
  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return { error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }

  return { session }
}

// GET /api/politiche-orario/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await guard()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const politica = await prisma.timekeepingPolicy.findFirst({
      where: { id, venueId },
      select: politicaSelect,
    })

    if (!politica) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    return NextResponse.json({ data: politica })
  } catch (err) {
    logger.error('Errore GET /api/politiche-orario/[id]', err)
    return NextResponse.json(
      { error: 'Errore nel recupero della regola orario' },
      { status: 500 }
    )
  }
}

// PUT /api/politiche-orario/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guard()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const esistente = await prisma.timekeepingPolicy.findFirst({
      where: { id, venueId },
      select: politicaSelect,
    })

    if (!esistente) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    const body = await request.json()
    const dati = politicaOrarioSchema.parse(body)
    const { extraBreaks, ...campi } = dati

    const politica = await prisma.$transaction(async (tx) => {
      if (campi.isDefault) {
        await tx.timekeepingPolicy.updateMany({
          where: { venueId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
      }

      // Le pause si riscrivono per intero: sono poche e senza identità propria
      // fuori dalla regola che le contiene.
      await tx.timekeepingPolicyBreak.deleteMany({ where: { policyId: id } })

      return tx.timekeepingPolicy.update({
        where: { id },
        data: {
          ...campi,
          extraBreaks: { create: extraBreaks },
        },
        select: politicaSelect,
      })
    })

    await createAuditLog({
      userId: session!.user.id,
      action: 'UPDATE',
      entityType: 'TimekeepingPolicy',
      entityId: id,
      venueId,
      oldValues: esistente,
      newValues: politica,
    })

    return NextResponse.json({ data: politica })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: err.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/politiche-orario/[id]', err)
    return NextResponse.json(
      { error: "Errore nell'aggiornamento della regola orario" },
      { status: 500 }
    )
  }
}

// DELETE /api/politiche-orario/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guard()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const politica = await prisma.timekeepingPolicy.findFirst({
      where: { id, venueId },
      select: {
        id: true,
        name: true,
        isDefault: true,
        _count: { select: { users: true, venuesAsDefault: true } },
      },
    })

    if (!politica) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    // Cancellare una regola in uso cambierebbe in silenzio le ore già calcolate
    // di chi la sta usando: meglio costringere a riassegnare prima.
    const assegnazioni = politica._count.users + politica._count.venuesAsDefault
    if (assegnazioni > 0) {
      return NextResponse.json(
        {
          error: `La regola è assegnata a ${assegnazioni} fra dipendenti e locali: riassegnali prima di eliminarla`,
        },
        { status: 409 }
      )
    }

    if (politica.isDefault) {
      return NextResponse.json(
        {
          error:
            'Questa è la regola predefinita: impostane un altra come predefinita prima di eliminarla',
        },
        { status: 409 }
      )
    }

    await prisma.timekeepingPolicy.delete({ where: { id } })

    await createAuditLog({
      userId: session!.user.id,
      action: 'DELETE',
      entityType: 'TimekeepingPolicy',
      entityId: id,
      venueId,
      oldValues: politica,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Errore DELETE /api/politiche-orario/[id]', err)
    return NextResponse.json(
      { error: "Errore nell'eliminazione della regola orario" },
      { status: 500 }
    )
  }
}
