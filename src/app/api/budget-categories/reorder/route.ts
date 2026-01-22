import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per riordinamento
const reorderSchema = z.object({
  venueId: z.string(),
  items: z.array(z.object({
    id: z.string(),
    displayOrder: z.number().int().min(0),
    parentId: z.string().optional().nullable(),
  })),
})

// PUT /api/budget-categories/reorder - Riordina categorie (drag & drop)
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()

    const validationResult = reorderSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Dati non validi', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { venueId, items } = validationResult.data

    // Verifica che tutte le categorie appartengano alla venue
    const categoryIds = items.map(i => i.id)
    const categories = await prisma.budgetCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, venueId: true, isSystem: true },
    })

    const invalid = categories.filter(c => c.venueId !== venueId)
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: 'Alcune categorie non appartengono alla sede specificata' },
        { status: 400 }
      )
    }

    // Previeni riferimenti circolari
    const parentChanges = items.filter(i => i.parentId !== undefined)
    for (const item of parentChanges) {
      if (item.parentId === item.id) {
        return NextResponse.json(
          { error: 'Una categoria non può essere padre di se stessa' },
          { status: 400 }
        )
      }

      // Verifica che il nuovo parent non sia un discendente
      if (item.parentId) {
        const descendants = await getDescendants(item.id)
        if (descendants.includes(item.parentId)) {
          return NextResponse.json(
            { error: `Riferimento circolare rilevato per la categoria ${item.id}` },
            { status: 400 }
          )
        }
      }
    }

    // Esegui aggiornamenti in transazione
    await prisma.$transaction(
      items.map(item =>
        prisma.budgetCategory.update({
          where: { id: item.id },
          data: {
            displayOrder: item.displayOrder,
            ...(item.parentId !== undefined && { parentId: item.parentId }),
          },
        })
      )
    )

    // Ritorna le categorie aggiornate
    const updated = await prisma.budgetCategory.findMany({
      where: { venueId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json({
      success: true,
      categories: updated,
      updatedCount: items.length,
    })
  } catch (error) {
    logger.error('Errore PUT budget-categories/reorder', error)
    return NextResponse.json(
      { error: 'Errore nel riordinamento delle categorie' },
      { status: 500 }
    )
  }
}

// Helper per ottenere tutti i discendenti di una categoria
async function getDescendants(categoryId: string): Promise<string[]> {
  const descendants: string[] = []

  const children = await prisma.budgetCategory.findMany({
    where: { parentId: categoryId },
    select: { id: true },
  })

  for (const child of children) {
    descendants.push(child.id)
    const grandchildren = await getDescendants(child.id)
    descendants.push(...grandchildren)
  }

  return descendants
}
