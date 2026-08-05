import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { promemoriaTimbraturaSchema } from '@/lib/validations/promemoria-timbratura'
import {
  guardAdminManager,
  promemoriaSelect,
  verificaDestinatari,
} from '../route'

// La lettura del singolo promemoria non esiste: la lista di
// GET /api/promemoria-timbratura porta già tutti i campi, e il form di modifica
// parte da quelli.

// PUT /api/promemoria-timbratura/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guardAdminManager()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const esistente = await prisma.clockReminder.findFirst({
      where: { id, venueId },
      select: promemoriaSelect,
    })

    if (!esistente) {
      return NextResponse.json({ error: 'Promemoria non trovato' }, { status: 404 })
    }

    const body = await request.json()
    const { recipientIds, ...campi } = promemoriaTimbraturaSchema.parse(body)

    const destinatariNonValidi = await verificaDestinatari(recipientIds, venueId)
    if (destinatariNonValidi) {
      return NextResponse.json({ error: destinatariNonValidi }, { status: 400 })
    }

    const promemoria = await prisma.$transaction(async (tx) => {
      // I destinatari si riscrivono per intero: sono un elenco senza identità
      // propria fuori dal promemoria che li contiene.
      await tx.clockReminderRecipient.deleteMany({ where: { reminderId: id } })

      return tx.clockReminder.update({
        where: { id },
        data: {
          ...campi,
          recipients: { create: recipientIds.map((userId) => ({ userId })) },
        },
        select: promemoriaSelect,
      })
    })

    await createAuditLog({
      userId: session!.user.id,
      action: 'UPDATE',
      entityType: 'ClockReminder',
      entityId: id,
      venueId,
      oldValues: esistente,
      newValues: promemoria,
    })

    return NextResponse.json({ data: promemoria })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: err.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/promemoria-timbratura/[id]', err)
    return NextResponse.json(
      { error: "Errore nell'aggiornamento del promemoria" },
      { status: 500 }
    )
  }
}

// DELETE /api/promemoria-timbratura/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await guardAdminManager()
    if (error) return error

    const { id } = await params
    const venueId = await getVenueId()

    const promemoria = await prisma.clockReminder.findFirst({
      where: { id, venueId },
      select: promemoriaSelect,
    })

    if (!promemoria) {
      return NextResponse.json({ error: 'Promemoria non trovato' }, { status: 404 })
    }

    // I destinatari se ne vanno con lui (onDelete: Cascade nello schema).
    await prisma.clockReminder.delete({ where: { id } })

    await createAuditLog({
      userId: session!.user.id,
      action: 'DELETE',
      entityType: 'ClockReminder',
      entityId: id,
      venueId,
      oldValues: promemoria,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Errore DELETE /api/promemoria-timbratura/[id]', err)
    return NextResponse.json(
      { error: "Errore nell'eliminazione del promemoria" },
      { status: 500 }
    )
  }
}
