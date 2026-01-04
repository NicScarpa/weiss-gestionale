import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per singolo mapping
const mappingSchema = z.object({
  accountId: z.string(),
  budgetCategoryId: z.string(),
  includeInBudget: z.boolean().optional(),
})

// Schema per mappings multipli (batch)
const batchMappingsSchema = z.object({
  venueId: z.string(),
  mappings: z.array(mappingSchema),
})

// GET /api/budget-categories/mappings - Lista tutti i mapping per venue
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const categoryId = searchParams.get('categoryId')
    const unmappedOnly = searchParams.get('unmappedOnly') === 'true'

    if (!venueId) {
      return NextResponse.json({ error: 'venueId richiesto' }, { status: 400 })
    }

    if (unmappedOnly) {
      // Restituisci i conti NON ancora mappati
      const unmappedAccounts = await prisma.account.findMany({
        where: {
          isActive: true,
          budgetMapping: null,
          // Solo conti rilevanti per il budget (costi e ricavi)
          type: { in: ['COSTO', 'RICAVO'] },
        },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          category: true,
        },
      })

      return NextResponse.json({
        unmappedAccounts,
        total: unmappedAccounts.length,
      })
    }

    const mappings = await prisma.accountBudgetMapping.findMany({
      where: {
        budgetCategory: {
          venueId,
          ...(categoryId ? { id: categoryId } : {}),
        },
      },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, category: true },
        },
        budgetCategory: {
          select: { id: true, code: true, name: true, categoryType: true },
        },
      },
      orderBy: {
        account: { code: 'asc' },
      },
    })

    // Raggruppa per categoria
    const byCategory = mappings.reduce((acc, mapping) => {
      const catId = mapping.budgetCategoryId
      if (!acc[catId]) {
        acc[catId] = {
          category: mapping.budgetCategory,
          accounts: [],
        }
      }
      acc[catId].accounts.push({
        ...mapping.account,
        includeInBudget: mapping.includeInBudget,
      })
      return acc
    }, {} as Record<string, { category: any; accounts: any[] }>)

    return NextResponse.json({
      mappings,
      byCategory: Object.values(byCategory),
      total: mappings.length,
    })
  } catch (error) {
    console.error('Errore GET budget-categories/mappings:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei mapping' },
      { status: 500 }
    )
  }
}

// POST /api/budget-categories/mappings - Crea/aggiorna mapping (singolo o batch)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()

    // Supporta sia singolo mapping che batch
    if (body.mappings && Array.isArray(body.mappings)) {
      // Batch mode
      const validationResult = batchMappingsSchema.safeParse(body)
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Dati non validi', details: validationResult.error.issues },
          { status: 400 }
        )
      }

      const { venueId, mappings } = validationResult.data

      // Verifica che tutte le categorie appartengano alla venue
      const categoryIds = [...new Set(mappings.map(m => m.budgetCategoryId))]
      const categories = await prisma.budgetCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, venueId: true },
      })

      const invalidCategories = categories.filter(c => c.venueId !== venueId)
      if (invalidCategories.length > 0) {
        return NextResponse.json(
          { error: 'Alcune categorie non appartengono alla sede specificata' },
          { status: 400 }
        )
      }

      // Esegui in transazione
      const result = await prisma.$transaction(async (tx) => {
        const results = []

        for (const mapping of mappings) {
          // Upsert: crea o aggiorna
          const created = await tx.accountBudgetMapping.upsert({
            where: { accountId: mapping.accountId },
            create: {
              accountId: mapping.accountId,
              budgetCategoryId: mapping.budgetCategoryId,
              includeInBudget: mapping.includeInBudget ?? true,
              createdBy: session.user!.id,
            },
            update: {
              budgetCategoryId: mapping.budgetCategoryId,
              includeInBudget: mapping.includeInBudget ?? true,
            },
            include: {
              account: { select: { id: true, code: true, name: true } },
              budgetCategory: { select: { id: true, code: true, name: true } },
            },
          })
          results.push(created)
        }

        return results
      })

      return NextResponse.json({
        success: true,
        mappings: result,
        count: result.length,
      })
    } else {
      // Singolo mapping
      const validationResult = mappingSchema.safeParse(body)
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Dati non validi', details: validationResult.error.issues },
          { status: 400 }
        )
      }

      const { accountId, budgetCategoryId, includeInBudget } = validationResult.data

      // Verifica che la categoria esista
      const category = await prisma.budgetCategory.findUnique({
        where: { id: budgetCategoryId },
      })

      if (!category) {
        return NextResponse.json(
          { error: 'Categoria non trovata' },
          { status: 404 }
        )
      }

      // Verifica che il conto esista
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      })

      if (!account) {
        return NextResponse.json(
          { error: 'Conto non trovato' },
          { status: 404 }
        )
      }

      // Upsert
      const mapping = await prisma.accountBudgetMapping.upsert({
        where: { accountId },
        create: {
          accountId,
          budgetCategoryId,
          includeInBudget: includeInBudget ?? true,
          createdBy: session.user.id,
        },
        update: {
          budgetCategoryId,
          includeInBudget: includeInBudget ?? true,
        },
        include: {
          account: { select: { id: true, code: true, name: true, type: true } },
          budgetCategory: { select: { id: true, code: true, name: true } },
        },
      })

      return NextResponse.json(mapping, { status: 201 })
    }
  } catch (error) {
    console.error('Errore POST budget-categories/mappings:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del mapping' },
      { status: 500 }
    )
  }
}

// DELETE /api/budget-categories/mappings - Rimuovi mapping (singolo o batch)
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const categoryId = searchParams.get('categoryId')

    if (accountId) {
      // Rimuovi singolo mapping per accountId
      const existing = await prisma.accountBudgetMapping.findUnique({
        where: { accountId },
      })

      if (!existing) {
        return NextResponse.json({ error: 'Mapping non trovato' }, { status: 404 })
      }

      await prisma.accountBudgetMapping.delete({
        where: { accountId },
      })

      return NextResponse.json({ success: true, message: 'Mapping rimosso' })
    } else if (categoryId) {
      // Rimuovi tutti i mapping di una categoria
      const result = await prisma.accountBudgetMapping.deleteMany({
        where: { budgetCategoryId: categoryId },
      })

      return NextResponse.json({
        success: true,
        message: `${result.count} mapping rimossi`,
        count: result.count,
      })
    } else {
      return NextResponse.json(
        { error: 'Specificare accountId o categoryId' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Errore DELETE budget-categories/mappings:', error)
    return NextResponse.json(
      { error: 'Errore nella rimozione del mapping' },
      { status: 500 }
    )
  }
}
