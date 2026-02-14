import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const categorizeSchema = z.object({
  budgetCategoryId: z.string().optional(),
  accountId: z.string().optional(),
  notes: z.string().optional(),
})

/**
 * PATCH /api/prima-nota/[id]/categorize
 * Assegna o modifica la categoria budget di una journal entry
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validated = categorizeSchema.parse(body)

    // Recupera la entry corrente
    const current = await prisma.journalEntry.findUnique({
      where: { id: params.id },
      select: { venueId: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    // Verifica autorizzazione sede
    if (session.user.role !== 'admin' && current.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    // Aggiorna categorizzazione
    const updated = await prisma.journalEntry.update({
      where: { id: params.id },
      data: {
        budgetCategoryId: validated.budgetCategoryId || null,
        accountId: validated.accountId || undefined,
        notes: validated.notes || undefined,
        verified: true, // Auto-verify su categorizzazione manuale
      },
    })

    return NextResponse.json({
      id: updated.id,
      budgetCategoryId: updated.budgetCategoryId,
      verified: updated.verified,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PATCH /api/prima-nota/[id]/categorize', error)
    return NextResponse.json(
      { error: 'Errore nella categorizzazione' },
      { status: 500 }
    )
  }
}
