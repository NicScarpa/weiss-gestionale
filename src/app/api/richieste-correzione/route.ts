import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import {
  badRequest,
  conflict,
  created,
  forbidden,
  handleApiError,
  ok,
  withAuth,
} from '@/lib/api-utils'
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
export const GET = withAuth(async (request: NextRequest, { user, venueId }) => {
  try {
    const statusParam = request.nextUrl.searchParams.get('status')
    const isGestore = ['admin', 'manager'].includes(user.role)

    const stati = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
    const status = stati.find((s) => s === statusParam)

    const richieste = await prisma.attendanceCorrectionRequest.findMany({
      where: {
        venueId,
        ...(isGestore ? {} : { userId: user.id }),
        ...(status && { status }),
      },
      select: richiestaSelect,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    })

    return ok({ data: richieste })
  } catch (error) {
    return handleApiError(
      error,
      'GET /api/richieste-correzione',
      'Errore nel recupero delle richieste'
    )
  }
}, { venueScoped: true })

// POST /api/richieste-correzione - Il dipendente chiede una correzione
export const POST = withAuth(async (request: NextRequest, { user: utenteInSessione }) => {
  try {
    const utente = await prisma.user.findUnique({
      where: { id: utenteInSessione.id },
      select: { id: true, portalEnabled: true, venueId: true },
    })

    if (!utente?.portalEnabled || !utente.venueId) {
      return forbidden('Accesso al portale non abilitato')
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
        return badRequest('Luogo non trovato')
      }
    }

    // L'anomalia collegata, se indicata, deve essere del richiedente.
    if (dati.anomalyId) {
      const anomalia = await prisma.attendanceAnomaly.findFirst({
        where: { id: dati.anomalyId, userId: utente.id },
        select: { id: true },
      })
      if (!anomalia) {
        return badRequest('Anomalia non trovata')
      }
    }

    // Una sola richiesta aperta per giornata: la seconda creerebbe solo
    // confusione in coda di approvazione.
    const giaAperta = await prisma.attendanceCorrectionRequest.findFirst({
      where: {
        userId: utente.id,
        date: toDateOnlyUtc(dati.date),
        status: 'PENDING',
      },
      select: { id: true },
    })

    if (giaAperta) {
      return conflict(
        'Hai già una richiesta in attesa per questa giornata: aspetta la risposta o annullala prima'
      )
    }

    // I minuti diventano istanti qui, nel fuso italiano della giornata chiesta.
    const richiesta = await prisma.attendanceCorrectionRequest.create({
      data: {
        userId: utente.id,
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
      userId: utente.id,
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

    return created({ data: richiesta })
  } catch (error) {
    return handleApiError(
      error,
      'POST /api/richieste-correzione',
      'Errore nella creazione della richiesta'
    )
  }
})
