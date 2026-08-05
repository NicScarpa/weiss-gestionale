import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { findEntryCandidates } from '@/lib/reconciliation/schedule-matcher'
import {
  reconcileScheduleWithEntry,
  rejectScheduleMatch,
} from '@/lib/services/schedule-reconciliation-service'

const createSchema = z.object({
  journalEntryId: z.string().min(1, 'Movimento obbligatorio'),
  /** Quota da imputare: se assente si usa il minore fra residuo e importo del movimento */
  amount: z.number().positive('La quota deve essere positiva').optional(),
  confidence: z.number().min(0).max(1).optional(),
  /** Rifiuta la proposta invece di confermarla */
  reject: z.boolean().optional(),
})

/**
 * GET /api/scadenzario/[id]/riconciliazioni
 * Riconciliazioni già registrate e movimenti candidati a saldare la scadenza.
 * I candidati sono calcolati al volo e non persistiti.
 */
export async function GET(
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

    const schedule = await prisma.schedule.findFirst({
      where: { id, venueId },
      select: { id: true },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const [riconciliazioni, candidati] = await Promise.all([
      prisma.scheduleReconciliation.findMany({
        where: { scheduleId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          source: true,
          amount: true,
          confidence: true,
          createdAt: true,
          journalEntry: {
            select: {
              id: true,
              date: true,
              description: true,
              debitAmount: true,
              creditAmount: true,
              registerType: true,
            },
          },
        },
      }),
      findEntryCandidates(id, venueId),
    ])

    // I movimenti già proposti e rifiutati non si ripropongono
    const scartati = new Set(
      riconciliazioni.filter((r) => r.status === 'REJECTED').map((r) => r.journalEntry.id)
    )
    const collegati = new Set(
      riconciliazioni.filter((r) => r.status === 'VERIFIED').map((r) => r.journalEntry.id)
    )

    return NextResponse.json({
      riconciliazioni,
      candidati: candidati.filter(
        (c) => !scartati.has(c.journalEntryId) && !collegati.has(c.journalEntryId)
      ),
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/[id]/riconciliazioni', error)
    return NextResponse.json(
      { error: 'Errore nel caricamento delle riconciliazioni' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/scadenzario/[id]/riconciliazioni
 * Collega un movimento alla scadenza, oppure registra il rifiuto di una proposta.
 */
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
    const data = createSchema.parse(body)

    if (data.reject) {
      const esito = await rejectScheduleMatch({
        scheduleId: id,
        journalEntryId: data.journalEntryId,
        venueId,
        userId: session.user.id,
        amount: data.amount ?? 0,
      })

      if (esito.outcome === 'schedule_not_found') {
        return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
      }

      return NextResponse.json({
        id: esito.reconciliationId,
        message: 'Proposta scartata',
      })
    }

    const esito = await reconcileScheduleWithEntry({
      scheduleId: id,
      journalEntryId: data.journalEntryId,
      venueId,
      userId: session.user.id,
      amount: data.amount,
      source: data.confidence !== undefined ? 'AUTOMATIC' : 'MANUAL',
      confidence: data.confidence,
    })

    switch (esito.outcome) {
      case 'schedule_not_found':
        return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })

      case 'entry_not_found':
        return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })

      case 'already_reconciled':
        return NextResponse.json(
          { error: 'Questo movimento è già riconciliato con la scadenza' },
          { status: 409 }
        )

      case 'schedule_closed':
        return NextResponse.json(
          { error: `La scadenza è ${esito.stato}: non può essere riconciliata` },
          { status: 409 }
        )

      case 'invalid_amount':
        return NextResponse.json({ error: esito.motivo }, { status: 400 })

      case 'ok':
        await createAuditLog({
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'ScheduleReconciliation',
          entityId: esito.reconciliationId,
          venueId,
          newValues: {
            scheduleId: id,
            journalEntryId: data.journalEntryId,
            stato: esito.scheduleStato,
          },
        })

        return NextResponse.json(
          {
            id: esito.reconciliationId,
            scheduleStato: esito.scheduleStato,
            importoPagato: esito.importoPagato,
            message:
              esito.scheduleStato === 'pagata'
                ? 'Scadenza saldata'
                : 'Riconciliazione registrata, la scadenza resta parzialmente pagata',
          },
          { status: 201 }
        )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/scadenzario/[id]/riconciliazioni', error)
    return NextResponse.json(
      { error: 'Errore nella riconciliazione' },
      { status: 500 }
    )
  }
}
