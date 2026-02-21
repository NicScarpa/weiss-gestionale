import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// POST /api/chiusure/[id]/submit - Invia chiusura per validazione
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Sessione scaduta: accedi di nuovo per inviare la chiusura' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Verifica che la chiusura esista
    const closure = await prisma.dailyClosure.findUnique({
      where: { id },
      include: {
        stations: true,
        expenses: true,
      },
    })

    if (!closure) {
      return NextResponse.json(
        { error: 'Bozza non trovata. Ricarica la pagina.' },
        { status: 404 }
      )
    }

    // Solo DRAFT può essere inviata
    if (closure.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'La chiusura non è in bozza e non può essere inviata' },
        { status: 400 }
      )
    }

    // Verifica che ci sia almeno una stazione
    if (closure.stations.length === 0) {
      return NextResponse.json(
        { error: 'Postazioni cassa: aggiungi almeno una postazione prima dell\'invio' },
        { status: 400 }
      )
    }

    const hasAnyActivity = closure.stations.some(
      (station) => Number(station.cashAmount || 0) > 0 || Number(station.posAmount || 0) > 0
    )
    if (!hasAnyActivity) {
      return NextResponse.json(
        {
          error:
            'Incassi: tutte le postazioni hanno Contanti e POS = 0. Inserisci almeno un incasso.',
        },
        { status: 400 }
      )
    }

    const expensesWithoutPaidBy = closure.expenses.filter(
      (expense) => Number(expense.amount || 0) > 0 && !expense.paidBy
    )
    if (expensesWithoutPaidBy.length > 0) {
      const example = expensesWithoutPaidBy[0]?.payee?.trim()
      const exampleLabel = example
        ? ` (es. ${example}${expensesWithoutPaidBy.length > 1 ? ` +${expensesWithoutPaidBy.length - 1} altre` : ''})`
        : ''
      return NextResponse.json(
        {
          error: `Uscite di cassa: manca "Pagato da" per ${expensesWithoutPaidBy.length} riga/e${exampleLabel}`,
        },
        { status: 400 }
      )
    }

    // Aggiorna stato a SUBMITTED
    const updated = await prisma.dailyClosure.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedById: session.user.id,
        submittedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
      },
    })

    return NextResponse.json({
      ...updated,
      message: 'Chiusura inviata per validazione',
    })
  } catch (error) {
    logger.error('Errore POST /api/chiusure/[id]/submit', error)
    return NextResponse.json(
      { error: 'Errore nell\'invio della chiusura. Riprova.' },
      { status: 500 }
    )
  }
}
