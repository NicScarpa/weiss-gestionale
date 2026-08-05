import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { rifiutoCorrezioneSchema } from '@/lib/validations/richieste-correzione'
import { notifyCorrectionRejected } from '@/lib/notifications/triggers'
import { richiestaSelect } from '../../route'

// POST /api/richieste-correzione/[id]/rifiuta
// Il motivo è obbligatorio: un rifiuto muto lascia il dipendente al punto di
// partenza, senza sapere cosa correggere nella richiesta.
export async function POST(
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

    const body = await request.json()
    const dati = rifiutoCorrezioneSchema.parse(body)

    const richiesta = await prisma.attendanceCorrectionRequest.findFirst({
      where: { id, ...(venueId && { venueId }) },
      select: { id: true, status: true, venueId: true },
    })

    if (!richiesta) {
      return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
    }

    if (richiesta.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'La richiesta è già stata decisa' },
        { status: 409 }
      )
    }

    const aggiornata = await prisma.attendanceCorrectionRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        reviewNotes: dati.reviewNotes,
      },
      select: richiestaSelect,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'AttendanceCorrectionRequest',
      entityId: id,
      venueId: richiesta.venueId,
      oldValues: { status: 'PENDING' },
      newValues: { status: 'REJECTED', motivo: dati.reviewNotes },
    })

    notifyCorrectionRejected(id, dati.reviewNotes).catch((err) =>
      logger.error('Errore notifica correzione rifiutata', err)
    )

    return NextResponse.json({ data: aggiornata })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/richieste-correzione/[id]/rifiuta', error)
    return NextResponse.json(
      { error: 'Errore nel rifiuto della richiesta' },
      { status: 500 }
    )
  }
}
