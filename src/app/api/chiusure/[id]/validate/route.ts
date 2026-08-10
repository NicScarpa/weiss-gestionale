import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { validateClosure } from '@/lib/services/closure-service'
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

    const result = await validateClosure({
      closureId: id,
      userId: session.user.id,
      action,
      rejectionNotes,
    })

    switch (result.outcome) {
      case 'not_found':
        return NextResponse.json({ error: 'Chiusura non trovata' }, { status: 404 })

      case 'invalid_status':
        return NextResponse.json(
          { error: 'Solo le chiusure inviate possono essere validate' },
          { status: 400 }
        )

      case 'missing_cost_center':
        return NextResponse.json(
          {
            error:
              'Impossibile validare: la chiusura non ha un centro di costo in testata. Apri la chiusura e selezionalo prima di procedere.',
          },
          { status: 400 }
        )

      case 'already_posted':
        return NextResponse.json(
          {
            error:
              'La chiusura ha già scritture di prima nota: validarla di nuovo ' +
              'duplicherebbe gli incassi del giorno',
            existingEntries: result.existingEntries,
          },
          { status: 409 }
        )

      case 'rejected':
        return NextResponse.json({
          ...result.closure,
          deletedJournalEntries: result.deletedJournalEntries,
          message: 'Chiusura rifiutata e riportata in bozza',
        })

      case 'approved':
        return NextResponse.json({
          ...result.closure,
          journalEntries: result.journalEntries,
          budgetAlerts: result.budgetAlerts,
          message: 'Chiusura validata con successo',
        })
    }
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
