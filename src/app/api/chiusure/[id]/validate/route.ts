import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  generateJournalEntriesFromClosure,
  deleteJournalEntriesForClosure,
} from '@/lib/closure-journal-entries'
import { generateAlertsForVenue } from '@/lib/budget/alert-generator'

import { logger } from '@/lib/logger'
// Schema per validazione/rifiuto
const validateSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionNotes: z.string().optional(),
})

// POST /api/chiusure/[id]/validate - Valida o rifiuta chiusura
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono validare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json(
        { error: 'Solo admin e manager possono validare le chiusure' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { action, rejectionNotes } = validateSchema.parse(body)

    // Verifica che la chiusura esista
    const closure = await prisma.dailyClosure.findUnique({
      where: { id },
      include: {
        stations: {
          include: {
            cashCount: true,
          },
        },
        expenses: true,
        venue: {
          select: {
            id: true,
            name: true,
            vatRate: true,
          },
        },
      },
    })

    if (!closure) {
      return NextResponse.json(
        { error: 'Chiusura non trovata' },
        { status: 404 }
      )
    }

    // Verifica accesso per manager (stessa sede)
    if (
      session.user.role === 'manager' &&
      session.user.venueId !== closure.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Solo SUBMITTED può essere validata
    if (closure.status !== 'SUBMITTED') {
      return NextResponse.json(
        { error: 'Solo le chiusure inviate possono essere validate' },
        { status: 400 }
      )
    }

    if (action === 'reject') {
      // Elimina eventuali movimenti prima nota già generati
      const deletedEntries = await deleteJournalEntriesForClosure(id)

      // Rifiuta e rimanda a DRAFT
      const updated = await prisma.dailyClosure.update({
        where: { id },
        data: {
          status: 'DRAFT',
          rejectionNotes: rejectionNotes || 'Chiusura rifiutata',
          // Reset submission info
          submittedById: null,
          submittedAt: null,
        },
        select: {
          id: true,
          status: true,
          rejectionNotes: true,
        },
      })

      return NextResponse.json({
        ...updated,
        deletedJournalEntries: deletedEntries,
        message: 'Chiusura rifiutata e riportata in bozza',
      })
    }

    // Approva: aggiorna stato a VALIDATED
    const updated = await prisma.dailyClosure.update({
      where: { id },
      data: {
        status: 'VALIDATED',
        validatedById: session.user.id,
        validatedAt: new Date(),
        rejectionNotes: null, // Pulisci eventuali note di rifiuto precedenti
      },
      select: {
        id: true,
        status: true,
        validatedAt: true,
      },
    })

    // Calcola il versamento banca dai dati della chiusura
    // bankDeposit = totale contanti - fondi cassa - uscite
    const cashTotal = closure.stations.reduce(
      (sum, s) => sum + (Number(s.cashAmount) || 0),
      0
    )
    const floatsTotal = closure.stations.reduce(
      (sum, s) => sum + (Number(s.floatAmount) || 0),
      0
    )
    const expensesTotal = closure.expenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0
    )
    const calculatedBankDeposit = Math.max(0, cashTotal - floatsTotal - expensesTotal)

    // Genera movimenti prima nota automatici
    const journalResult = await generateJournalEntriesFromClosure(
      {
        id: closure.id,
        date: closure.date,
        venueId: closure.venueId,
        bankDeposit: calculatedBankDeposit,
        stations: closure.stations.map((s) => ({
          cashAmount: s.cashAmount ? Number(s.cashAmount) : null,
          posAmount: s.posAmount ? Number(s.posAmount) : null,
          floatAmount: s.floatAmount ? Number(s.floatAmount) : null,
        })),
        expenses: closure.expenses.map((e) => ({
          amount: Number(e.amount),
          payee: e.payee,
          description: e.description,
          documentRef: e.documentRef,
          accountId: e.accountId,
        })),
      },
      session.user.id
    )

    // Genera alert budget per la venue (async, non blocca la risposta)
    let alertsResult = null
    try {
      alertsResult = await generateAlertsForVenue(closure.venueId)
    } catch (alertError) {
      // Log ma non blocca la validazione
      logger.error('Errore generazione alert budget', alertError)
    }

    return NextResponse.json({
      ...updated,
      journalEntries: journalResult,
      budgetAlerts: alertsResult,
      message: 'Chiusura validata con successo',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/chiusure/[id]/validate', error)
    return NextResponse.json(
      { error: 'Errore nella validazione della chiusura' },
      { status: 500 }
    )
  }
}
