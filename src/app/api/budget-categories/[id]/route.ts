import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema di validazione per aggiornamento categoria
const updateCategorySchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  categoryType: z.enum(['REVENUE', 'COST', 'KPI', 'TAX', 'INVESTMENT', 'VAT']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  benchmarkPercentage: z.number().min(0).max(100).optional().nullable(),
  benchmarkComparison: z.enum(['LESS_THAN', 'GREATER_THAN', 'EQUAL']).optional(),
  alertThresholdPercent: z.number().min(0).max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/budget-categories/[id] - Ottieni singola categoria
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const category = await prisma.budgetCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: {
          select: { id: true, code: true, name: true, displayOrder: true },
          orderBy: { displayOrder: 'asc' },
        },
        accountMappings: {
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true, category: true },
            },
          },
        },
        budgetLines: {
          select: { id: true, budgetId: true },
          take: 10,
        },
        _count: {
          select: { accountMappings: true, budgetLines: true, children: true },
        },
      },
    })

    if (!category) {
      return NextResponse.json({ error: 'Categoria non trovata' }, { status: 404 })
    }

    return NextResponse.json(category)
  } catch (error) {
    logger.error('Errore GET budget-categories/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della categoria' },
      { status: 500 }
    )
  }
}

// PUT /api/budget-categories/[id] - Aggiorna categoria
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Verifica esistenza
    const existing = await prisma.budgetCategory.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Categoria non trovata' }, { status: 404 })
    }

    // Categorie di sistema non possono essere modificate in alcuni campi
    if (existing.isSystem) {
      const restrictedFields = ['code', 'categoryType', 'isSystem']
      const hasRestrictedChanges = restrictedFields.some(field => body[field] !== undefined)
      if (hasRestrictedChanges) {
        return NextResponse.json(
          { error: 'Le categorie di sistema non possono essere modificate in modo sostanziale' },
          { status: 403 }
        )
      }
    }

    // Valida i dati
    const validationResult = updateCategorySchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Dati non validi', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const validData = validationResult.data

    // Se cambia il code, verifica unicità
    if (validData.code && validData.code !== existing.code) {
      const duplicate = await prisma.budgetCategory.findUnique({
        where: { venueId_code: { venueId: existing.venueId, code: validData.code } },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: `Categoria con codice "${validData.code}" già esistente` },
          { status: 409 }
        )
      }
    }

    // Previeni riferimenti circolari nel parent
    if (validData.parentId) {
      if (validData.parentId === id) {
        return NextResponse.json(
          { error: 'Una categoria non può essere padre di se stessa' },
          { status: 400 }
        )
      }

      // Verifica che il nuovo parent non sia un figlio di questa categoria
      const children = await prisma.budgetCategory.findMany({
        where: { parentId: id },
        select: { id: true },
      })

      if (children.some(c => c.id === validData.parentId)) {
        return NextResponse.json(
          { error: 'Riferimento circolare: il parent selezionato è un figlio di questa categoria' },
          { status: 400 }
        )
      }
    }

    const category = await prisma.budgetCategory.update({
      where: { id },
      data: {
        ...(validData.code && { code: validData.code.toUpperCase().replace(/\s+/g, '_') }),
        ...(validData.name && { name: validData.name }),
        ...(validData.parentId !== undefined && { parentId: validData.parentId }),
        ...(validData.displayOrder !== undefined && { displayOrder: validData.displayOrder }),
        ...(validData.categoryType && { categoryType: validData.categoryType }),
        ...(validData.color !== undefined && { color: validData.color }),
        ...(validData.icon !== undefined && { icon: validData.icon }),
        ...(validData.benchmarkPercentage !== undefined && { benchmarkPercentage: validData.benchmarkPercentage }),
        ...(validData.benchmarkComparison && { benchmarkComparison: validData.benchmarkComparison }),
        ...(validData.alertThresholdPercent !== undefined && { alertThresholdPercent: validData.alertThresholdPercent }),
        ...(validData.description !== undefined && { description: validData.description }),
        ...(validData.isActive !== undefined && { isActive: validData.isActive }),
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        accountMappings: {
          include: {
            account: { select: { id: true, code: true, name: true } },
          },
        },
      },
    })

    return NextResponse.json(category)
  } catch (error) {
    logger.error('Errore PUT budget-categories/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della categoria' },
      { status: 500 }
    )
  }
}

// DELETE /api/budget-categories/[id] - Elimina categoria
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.budgetCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { accountMappings: true, budgetLines: true, children: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Categoria non trovata' }, { status: 404 })
    }

    // Categorie di sistema non possono essere eliminate
    if (existing.isSystem) {
      return NextResponse.json(
        { error: 'Le categorie di sistema non possono essere eliminate' },
        { status: 403 }
      )
    }

    // Verifica dipendenze
    if (existing._count.children > 0) {
      return NextResponse.json(
        { error: 'Impossibile eliminare: la categoria ha sottocategorie. Elimina prima le sottocategorie.' },
        { status: 409 }
      )
    }

    if (existing._count.budgetLines > 0) {
      return NextResponse.json(
        { error: 'Impossibile eliminare: la categoria è utilizzata in righe budget esistenti.' },
        { status: 409 }
      )
    }

    // Elimina i mapping dei conti associati
    await prisma.accountBudgetMapping.deleteMany({
      where: { budgetCategoryId: id },
    })

    // Elimina la categoria
    await prisma.budgetCategory.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, message: 'Categoria eliminata' })
  } catch (error) {
    logger.error('Errore DELETE budget-categories/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della categoria' },
      { status: 500 }
    )
  }
}
