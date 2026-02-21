import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { ScheduleStatus } from '@/types/schedule'

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

    // Verifica esistenza scadenza
    const schedule = await prisma.schedule.findFirst({
      where: { id },
      select: {
        id: true,
        venueId: true,
        importoTotale: true,
        stato: true,
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    // Verifica esistenza pagamento
    const payment = await prisma.schedulePayment.findFirst({
      where: { id: paymentId, scheduleId: id },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    // Elimina pagamento
    await prisma.schedulePayment.delete({
      where: { id: paymentId },
    })

    // Ricalcola totale pagato
    const aggregatedPayments = await prisma.schedulePayment.aggregate({
      where: { scheduleId: id },
      _sum: { importo: true },
    })

    const nuovoImportoPagato = Number(aggregatedPayments._sum.importo || 0)
    const importoTotale = Number(schedule.importoTotale)

    // Determina nuovo stato
    let nuovoStato: string
    if (nuovoImportoPagato >= importoTotale) {
      nuovoStato = ScheduleStatus.PAGATA
    } else if (nuovoImportoPagato > 0) {
      nuovoStato = ScheduleStatus.PARZIALMENTE_PAGATA
    } else {
      nuovoStato = ScheduleStatus.APERTA
    }

    // Aggiorna schedule
    await prisma.schedule.update({
      where: { id },
      data: {
        importoPagato: nuovoImportoPagato,
        stato: nuovoStato,
        ...(nuovoStato !== ScheduleStatus.PAGATA && {
          dataPagamento: null,
        }),
      },
    })

    return NextResponse.json({ message: 'Pagamento eliminato' })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/[id]/pagamenti/[paymentId]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del pagamento' },
      { status: 500 }
    )
  }
}
