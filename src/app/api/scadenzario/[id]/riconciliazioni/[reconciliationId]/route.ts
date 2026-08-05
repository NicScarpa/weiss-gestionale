import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { undoScheduleReconciliation } from '@/lib/services/schedule-reconciliation-service'

/**
 * DELETE /api/scadenzario/[id]/riconciliazioni/[reconciliationId]
 * Annulla una riconciliazione sbagliata: rimuove il pagamento generato e
 * riporta la scadenza allo stato precedente.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reconciliationId: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id, reconciliationId } = await params
    const venueId = await getVenueId()

    const esito = await undoScheduleReconciliation({ reconciliationId, venueId })

    if (esito.outcome === 'not_found') {
      return NextResponse.json(
        { error: 'Riconciliazione non trovata' },
        { status: 404 }
      )
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'ScheduleReconciliation',
      entityId: reconciliationId,
      venueId,
      oldValues: { scheduleId: id },
      newValues: { scheduleStato: esito.scheduleStato },
    })

    return NextResponse.json({
      scheduleStato: esito.scheduleStato,
      message: 'Riconciliazione annullata',
    })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/[id]/riconciliazioni/[reconciliationId]', error)
    return NextResponse.json(
      { error: 'Errore nell\'annullamento della riconciliazione' },
      { status: 500 }
    )
  }
}
