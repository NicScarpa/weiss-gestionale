import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { romeInstant, toDateOnlyUtc } from '@/lib/timezone'
import { richiestaCorrezioneSchema } from '@/lib/validations/richieste-correzione'
import { notifyNewCorrectionRequest } from '@/lib/notifications/triggers'

/** Campi restituiti al client, uguali in lista e nelle azioni. */
export const richiestaSelect = {
  id: true,
  date: true,
  requestedClockIn: true,
  requestedClockOut: true,
  reason: true,
  status: true,
  reviewNotes: true,
  reviewedAt: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true } },
  workLocation: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  anomaly: { select: { id: true, anomalyType: true, status: true } },
} as const

// GET /api/richieste-correzione?status=&month=&year= - Elenco richieste.
// Lo staff vede solo le proprie; admin e manager tutte quelle della sede.
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const isGestore = ['admin', 'manager'].includes(session.user.role || '')

    const stati = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
    const status = stati.find((s) => s === statusParam)

    const venueId = await getVenueId()

    const richieste = await prisma.attendanceCorrectionRequest.findMany({
      where: {
        ...(venueId && { venueId }),
        ...(isGestore ? {} : { userId: session.user.id }),
        ...(status && { status }),
      },
      select: richiestaSelect,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    })

    return NextResponse.json({ data: richieste })
  } catch (error) {
    logger.error('Errore GET /api/richieste-correzione', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle richieste' },
      { status: 500 }
    )
  }
}

// POST /api/richieste-correzione - Il dipendente chiede una correzione
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const utente = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, portalEnabled: true, venueId: true },
    })

    if (!utente?.portalEnabled || !utente.venueId) {
      return NextResponse.json(
        { error: 'Accesso al portale non abilitato' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const dati = richiestaCorrezioneSchema.parse(body)

    const venueId = utente.venueId

    // Il luogo, se indicato, deve esistere nella sede.
    if (dati.workLocationId) {
      const luogo = await prisma.workLocation.findFirst({
        where: { id: dati.workLocationId, venueId },
        select: { id: true },
      })
      if (!luogo) {
        return NextResponse.json({ error: 'Luogo non trovato' }, { status: 400 })
      }
    }

    // L'anomalia collegata, se indicata, deve essere del richiedente.
    if (dati.anomalyId) {
      const anomalia = await prisma.attendanceAnomaly.findFirst({
        where: { id: dati.anomalyId, userId: session.user.id },
        select: { id: true },
      })
      if (!anomalia) {
        return NextResponse.json(
          { error: 'Anomalia non trovata' },
          { status: 400 }
        )
      }
    }

    // Una sola richiesta aperta per giornata: la seconda creerebbe solo
    // confusione in coda di approvazione.
    const giaAperta = await prisma.attendanceCorrectionRequest.findFirst({
      where: {
        userId: session.user.id,
        date: toDateOnlyUtc(dati.date),
        status: 'PENDING',
      },
      select: { id: true },
    })

    if (giaAperta) {
      return NextResponse.json(
        {
          error:
            'Hai già una richiesta in attesa per questa giornata: aspetta la risposta o annullala prima',
        },
        { status: 409 }
      )
    }

    // I minuti diventano istanti qui, nel fuso italiano della giornata chiesta.
    const richiesta = await prisma.attendanceCorrectionRequest.create({
      data: {
        userId: session.user.id,
        venueId,
        workLocationId: dati.workLocationId,
        date: toDateOnlyUtc(dati.date),
        requestedClockIn:
          dati.requestedClockInMinutes !== null
            ? romeInstant(dati.date, dati.requestedClockInMinutes)
            : null,
        requestedClockOut:
          dati.requestedClockOutMinutes !== null
            ? romeInstant(dati.date, dati.requestedClockOutMinutes)
            : null,
        reason: dati.reason,
        anomalyId: dati.anomalyId,
      },
      select: richiestaSelect,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'AttendanceCorrectionRequest',
      entityId: richiesta.id,
      venueId,
      newValues: {
        date: dati.date,
        reason: dati.reason,
      },
    })

    notifyNewCorrectionRequest(richiesta.id).catch((err) =>
      logger.error('Errore notifica nuova richiesta di correzione', err)
    )

    return NextResponse.json({ data: richiesta }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/richieste-correzione', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della richiesta' },
      { status: 500 }
    )
  }
}
