import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema di validazione per nuova categoria
const createCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  parentId: z.string().optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  categoryType: z.enum(['REVENUE', 'COST', 'KPI', 'TAX', 'INVESTMENT', 'VAT']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  benchmarkPercentage: z.number().min(0).max(100).optional().nullable(),
  benchmarkComparison: z.enum(['LESS_THAN', 'GREATER_THAN', 'EQUAL']).optional(),
  alertThresholdPercent: z.number().min(0).max(100).optional().nullable(),
  description: z.string().optional().nullable(),
})

// GET /api/budget-categories - Lista categorie per venue
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const categoryType = searchParams.get('categoryType')

    if (!venueId) {
      return NextResponse.json(
        { error: 'venueId richiesto' },
        { status: 400 }
      )
    }

    const categories = await prisma.budgetCategory.findMany({
      where: {
        venueId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(categoryType ? { categoryType: categoryType as any } : {}),
      },
      include: {
        parent: {
          select: { id: true, code: true, name: true },
        },
        children: {
          where: includeInactive ? {} : { isActive: true },
          select: { id: true, code: true, name: true },
        },
        accountMappings: {
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
        },
        _count: {
          select: { accountMappings: true, budgetLines: true },
        },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    })

    // Organizza in struttura gerarchica
    const rootCategories = categories.filter(c => !c.parentId)
    const childCategories = categories.filter(c => c.parentId)

    const hierarchy = rootCategories.map(root => ({
      ...root,
      children: childCategories.filter(c => c.parentId === root.id),
    }))

    return NextResponse.json({
      categories,
      hierarchy,
      total: categories.length,
    })
  } catch (error) {
    logger.error('Errore GET budget-categories', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle categorie' },
      { status: 500 }
    )
  }
}

// POST /api/budget-categories - Crea nuova categoria
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const { venueId, ...data } = body

    if (!venueId) {
      return NextResponse.json(
        { error: 'venueId richiesto' },
        { status: 400 }
      )
    }

    // Valida i dati
    const validationResult = createCategorySchema.safeParse(data)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Dati non validi', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const validData = validationResult.data

    // Verifica che il code sia unico per la venue
    const existing = await prisma.budgetCategory.findUnique({
      where: { venueId_code: { venueId, code: validData.code } },
    })

    if (existing) {
      return NextResponse.json(
        { error: `Categoria con codice "${validData.code}" già esistente` },
        { status: 409 }
      )
    }

    // Se c'è un parent, verifica che esista
    if (validData.parentId) {
      const parent = await prisma.budgetCategory.findUnique({
        where: { id: validData.parentId },
      })
      if (!parent || parent.venueId !== venueId) {
        return NextResponse.json(
          { error: 'Categoria padre non valida' },
          { status: 400 }
        )
      }
    }

    // Determina displayOrder se non specificato
    let displayOrder = validData.displayOrder
    if (displayOrder === undefined) {
      const maxOrder = await prisma.budgetCategory.aggregate({
        where: { venueId, parentId: validData.parentId || null },
        _max: { displayOrder: true },
      })
      displayOrder = (maxOrder._max.displayOrder ?? -1) + 1
    }

    const category = await prisma.budgetCategory.create({
      data: {
        venueId,
        code: validData.code.toUpperCase().replace(/\s+/g, '_'),
        name: validData.name,
        parentId: validData.parentId || null,
        displayOrder,
        categoryType: validData.categoryType || 'COST',
        color: validData.color,
        icon: validData.icon,
        benchmarkPercentage: validData.benchmarkPercentage,
        benchmarkComparison: validData.benchmarkComparison || 'LESS_THAN',
        alertThresholdPercent: validData.alertThresholdPercent ?? 10,
        description: validData.description,
        isSystem: false,
        isActive: true,
        createdBy: session.user.id,
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    logger.error('Errore POST budget-categories', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della categoria' },
      { status: 500 }
    )
  }
}
