import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'

const eseguiSchema = z.object({
  costCenterId: z.string().optional().nullable(),
})

/**
 * POST /api/pagamenti/[id]/esegui
 * Esegue un pagamento: crea journal entry e aggiorna stato
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // La disposizione arriva anche senza corpo (è un bottone): un JSON assente
    // vale come nessun centro esplicito.
    const body = await request.json().catch(() => ({}))
    const { costCenterId } = eseguiSchema.parse(body)

    const payment = await prisma.payment.findUnique({
      where: { id: id },
      include: {
        venue: { select: { id: true, name: true, code: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    // Verifica stato
    if (payment.stato === 'COMPLETATO' || payment.stato === 'ANNULLATO') {
      return NextResponse.json(
        { error: 'Pagamento gi completato o annullato' },
        { status: 400 }
      )
    }

    // Il movimento del pagamento non porta conto economico: il centro è
    // quello esplicito, se indicato, altrimenti il default.
    const centro = await risolviCentroDiCosto(prisma, { accountId: null, costCenterId })
    if (centro.outcome === 'invalid') {
      return NextResponse.json(
        { error: centro.motivo, code: centro.code },
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
        costCenterId: centro.costCenterId,
        costCenterSource: centro.origine,
        createdById: session.user.id,
        paymentId: payment.id,
        verified: true,
        notes: payment.note,
      },
    })

    // Aggiorna stato pagamento
    const updated = await prisma.payment.update({
      where: { id: id },
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/pagamenti/[id]/esegui', error)
    return NextResponse.json(
      { error: 'Errore nell\'esecuzione del pagamento' },
      { status: 500 }
    )
  }
}
