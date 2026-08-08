import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { createManualPunch } from '@/lib/attendance/manual-punch'
import { approvazioneCorrezioneSchema } from '@/lib/validations/richieste-correzione'
import { notifyCorrectionApproved } from '@/lib/notifications/triggers'
import { richiestaSelect } from '../../route'

// POST /api/richieste-correzione/[id]/approva
//
// L'approvazione GENERA le timbrature: entrata e/o uscita proposte diventano
// timbrature manuali collegate alla richiesta, in un'unica transazione.
// Se la richiesta era nata da un'anomalia, l'anomalia si chiude insieme.
export const POST = withAuth<{ id: string }>(
  async (request: NextRequest, { params, user: revisore }) => {
  try {
    const { id } = params
    const venueId = await getVenueId()

    const body = await request.json().catch(() => ({}))
    const dati = approvazioneCorrezioneSchema.parse(body)

    const richiesta = await prisma.attendanceCorrectionRequest.findFirst({
      where: { id, ...(venueId && { venueId }) },
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

    const aggiornata = await prisma.$transaction(async (tx) => {
      if (richiesta.requestedClockIn) {
        await createManualPunch(tx, {
          userId: richiesta.userId,
          venueId: richiesta.venueId,
          workLocationId: richiesta.workLocationId,
          punchType: 'IN',
          punchedAt: richiesta.requestedClockIn,
          enteredById: revisore.id,
          reason: `Richiesta di correzione approvata: ${richiesta.reason}`,
          correctionRequestId: richiesta.id,
        })
      }

      if (richiesta.requestedClockOut) {
        await createManualPunch(tx, {
          userId: richiesta.userId,
          venueId: richiesta.venueId,
          workLocationId: richiesta.workLocationId,
          punchType: 'OUT',
          punchedAt: richiesta.requestedClockOut,
          enteredById: revisore.id,
          reason: `Richiesta di correzione approvata: ${richiesta.reason}`,
          correctionRequestId: richiesta.id,
        })
      }

      // L'anomalia che aveva originato la richiesta si risolve insieme.
      // APPROVED è lo stato che il resto del modulo usa per "risolta".
      if (richiesta.anomalyId) {
        await tx.attendanceAnomaly.updateMany({
          where: { id: richiesta.anomalyId, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            resolvedBy: revisore.id,
            resolvedAt: new Date(),
            resolutionNotes: 'Risolta con una richiesta di correzione approvata',
          },
        })
      }

      return tx.attendanceCorrectionRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedById: revisore.id,
          reviewedAt: new Date(),
          reviewNotes: dati.reviewNotes,
        },
        select: richiestaSelect,
      })
    })

    await createAuditLog({
      userId: revisore.id,
      action: 'UPDATE',
      entityType: 'AttendanceCorrectionRequest',
      entityId: id,
      venueId: richiesta.venueId,
      oldValues: { status: 'PENDING' },
      newValues: {
        status: 'APPROVED',
        richiedente: `${aggiornata.user.firstName} ${aggiornata.user.lastName}`,
      },
    })

    notifyCorrectionApproved(id).catch((err) =>
      logger.error('Errore notifica correzione approvata', err)
    )

    return NextResponse.json({ data: aggiornata })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/richieste-correzione/[id]/approva', error)
    return NextResponse.json(
      { error: "Errore nell'approvazione della richiesta" },
      { status: 500 }
    )
  }
},
  { roles: ['admin', 'manager'] }
)
