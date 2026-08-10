import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'

import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { trovaSessioniAperte } from '@/lib/attendance/sessioni-aperte'

/**
 * POST /api/chiusure/[id]/submit - Invia chiusura per validazione
 *
 * Lo staff resta fra i ruoli ammessi: è chi lavora in sala a compilare e
 * inviare la chiusura a fine turno (vedi STAFF_ALLOWED_PATHS nel layout della
 * dashboard). Ciò che allo staff resta precluso è la validazione, che genera le
 * scritture contabili.
 */
export const POST = withAuth<{ id: string }>(
  async (request, { user, params, venueId }) => {
  try {
    const { id } = params

    // Verifica che la chiusura esista nella sede della sessione
    const closure = await prisma.dailyClosure.findFirst({
      where: { id, venueId },
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

    // La chiusura termina il servizio: non si invia finché qualcuno risulta
    // ancora dentro. Le uscite si confermano nella sezione Presenze — anche
    // per chi è andato via prima senza timbrare.
    const sessioniAperte = await trovaSessioniAperte(
      closure.venueId,
      closure.date.toISOString().slice(0, 10)
    )
    if (sessioniAperte.length > 0) {
      const nomi = sessioniAperte
        .map((s) => `${s.firstName} ${s.lastName}`)
        .join(', ')
      return NextResponse.json(
        {
          error:
            `Timbrature ancora aperte per: ${nomi}. Conferma gli orari di ` +
            'uscita nella sezione Presenze prima di inviare la chiusura.',
        },
        { status: 400 }
      )
    }

    // Aggiorna stato a SUBMITTED
    const updated = await prisma.dailyClosure.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedById: user.id,
        submittedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
      },
    })

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'DailyClosure',
      entityId: id,
      newValues: { status: 'SUBMITTED' },
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
  },
  { roles: ['admin', 'manager', 'staff'], venueScoped: true }
)
