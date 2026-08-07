import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'

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

    const body = await request.json()
    const validated = categorizeSchema.parse(body)

    // Recupera la entry corrente
    const current = await prisma.journalEntry.findUnique({
      where: { id: id },
      select: { id: true, costCenterId: true, _count: { select: { allocations: true } } },
    })

    if (!current) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    // Un movimento suddiviso in fette (Allocation) è governato dalla
    // suddivisione: la categorizzazione manuale non deve poterla scavalcare.
    if (current._count.allocations > 0) {
      return NextResponse.json(
        { error: 'Il movimento è suddiviso in fette: rimuovi prima la suddivisione' },
        { status: 409 }
      )
    }

    // Il conto è l'asse di imputazione: se arriva, la categoria si deriva
    // sempre dalla mappatura (il conto vince su una categoria esplicita).
    // Una categoria senza conto resta accettata durante la transizione
    const budgetCategoryId = validated.accountId
      ? await derivaBudgetCategoryDaConto(validated.accountId)
      : validated.budgetCategoryId || null

    // Il nuovo conto può richiedere un centro di costo che il movimento non
    // ha: in quel caso la categorizzazione si ferma qui, il centro va scelto
    // prima (dal dettaglio del movimento).
    let costCenterId: string | undefined
    if (validated.accountId) {
      const centro = await risolviCentroDiCosto(prisma, {
        accountId: validated.accountId,
        costCenterId: current.costCenterId,
      })
      if (centro.outcome === 'invalid') {
        return NextResponse.json(
          { error: centro.motivo, code: centro.code },
          { status: 400 }
        )
      }
      costCenterId = centro.costCenterId
    }

    const updated = await prisma.journalEntry.update({
      where: { id: id },
      data: {
        budgetCategoryId,
        accountId: validated.accountId || undefined,
        costCenterId,
        notes: validated.notes || undefined,
        categorizationSource: 'manual',
        verified: true, // Auto-verify su categorizzazione manuale
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'JournalEntry',
      entityId: id,
      newValues: { budgetCategoryId, accountId: validated.accountId },
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
