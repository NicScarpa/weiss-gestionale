import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * POST /api/pagamenti/[id]/esegui
 * Esegue un pagamento: crea journal entry e aggiorna stato
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: {
        venue: { select: { id: true, name: true, code: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    // Verifica autorizzazione sede
    if (session.user.role !== 'admin' && payment.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    // Verifica stato
    if (payment.stato === 'COMPLETATO' || payment.stato === 'ANNULLATO') {
      return NextResponse.json(
        { error: 'Pagamento gi completato o annullato' },
        { status: 400 }
      )
    }

    // Crea journal entry per il pagamento
    const journalEntry = await prisma.journalEntry.create({
      data: {
        venueId: payment.venueId,
        date: payment.dataEsecuzione,
        registerType: 'BANK',
        description: `Pagamento: ${payment.beneficiarioNome}${payment.causale ? ` - ${payment.causale}` : ''}`,
        documentRef: payment.riferimentoInterno || undefined,
        debitAmount: Number(payment.importo),
        creditAmount: undefined,
        createdById: session.user.id,
        paymentId: payment.id,
        verified: true,
        notes: payment.note,
      },
    })

    // Aggiorna stato pagamento
    const updated = await prisma.payment.update({
      where: { id: params.id },
      data: {
        stato: 'DISPOSTO',
        journalEntryId: journalEntry.id,
      },
    })

    return NextResponse.json({
      payment: updated,
      journalEntry,
    })
  } catch (error) {
    console.error('Errore POST /api/pagamenti/[id]/esegui', error)
    return NextResponse.json(
      { error: 'Errore nell\'esecuzione del pagamento' },
      { status: 500 }
    )
  }
}
