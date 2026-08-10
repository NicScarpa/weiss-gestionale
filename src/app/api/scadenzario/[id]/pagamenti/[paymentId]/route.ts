import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import { bloccaScadenza, ricalcolaStatoSchedule } from '@/lib/scadenzario/stato-schedule'

// DELETE /api/scadenzario/[id]/pagamenti/[paymentId] - Elimina pagamento
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Cancellazione e ricalcolo nella stessa transazione, con la scadenza
    // bloccata: la terza variante della macchina a stati viveva qui, e un
    // pagamento cancellato mentre ne entrava un altro lasciava l'importo
    // pagato disallineato dai pagamenti realmente registrati.
    const esito = await prisma.$transaction(async (tx) => {
      const schedule = await bloccaScadenza(tx, id)
      if (!schedule) return { errore: 'scadenza' } as const

      const payment = await tx.schedulePayment.findFirst({
        where: { id: paymentId, scheduleId: id },
        select: { id: true, reconciliation: { select: { id: true } } },
      })
      if (!payment) return { errore: 'pagamento' } as const

      // Un pagamento nato da una riconciliazione non si cancella da qui: si
      // annulla la riconciliazione, che ritira anche le fette ereditate sul
      // movimento. Cancellarlo qui lascerebbe la riconciliazione a puntare
      // nel vuoto.
      if (payment.reconciliation) {
        return { errore: 'riconciliato', reconciliationId: payment.reconciliation.id } as const
      }

      await tx.schedulePayment.delete({ where: { id: paymentId } })

      return { stato: (await ricalcolaStatoSchedule(tx, id))! } as const
    })

    if ('errore' in esito) {
      if (esito.errore === 'scadenza') {
        return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
      }
      if (esito.errore === 'pagamento') {
        return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
      }
      return NextResponse.json(
        {
          error:
            'Questo pagamento proviene da una riconciliazione: annulla la riconciliazione ' +
            'per rimuoverlo',
          reconciliationId: esito.reconciliationId,
        },
        { status: 409 }
      )
    }

    // Il fornitore ha una scadenza in meno fra quelle pagate: le stime delle
    // sue scadenze aperte non devono più incorporare quell'osservazione
    if (esito.stato.riaperta && esito.stato.tipo === 'passiva' && esito.stato.supplierId) {
      await ricalcolaStimeFornitore(esito.stato.supplierId, esito.stato.venueId)
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'SchedulePayment',
      entityId: paymentId,
      newValues: { scheduleId: id },
    })

    return NextResponse.json({ message: 'Pagamento eliminato', stato: esito.stato.stato })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/[id]/pagamenti/[paymentId]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del pagamento' },
      { status: 500 }
    )
  }
}
