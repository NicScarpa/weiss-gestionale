import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { aggregateCategoriesForBudget } from '@/lib/budget/category-aggregator'

import { logger } from '@/lib/logger'
// GET /api/budget/[id]/categories - Budget aggregato per categoria
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Recupera il budget
    const budget = await prisma.budget.findUnique({
      where: { id },
      select: {
        id: true,
        venueId: true,
        year: true,
        status: true,
        name: true,
      },
    })

    if (!budget) {
      return NextResponse.json({ error: 'Budget non trovato' }, { status: 404 })
    }

    // Aggrega i dati per categoria
    const result = await aggregateCategoriesForBudget(
      budget.id,
      budget.venueId,
      budget.year
    )

    return NextResponse.json({
      ...result,
      budgetName: budget.name,
      budgetStatus: budget.status,
    })
  } catch (error) {
    logger.error('Errore GET /api/budget/[id]/categories', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle categorie budget' },
      { status: 500 }
    )
  }
}
