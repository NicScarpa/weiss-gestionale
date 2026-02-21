import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import {
  createBudgetSchema,
  budgetFiltersSchema,
} from '@/lib/validations/budget'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
// GET /api/budget - Lista budget con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Parse filtri
    const filters = budgetFiltersSchema.parse({
      venueId: searchParams.get('venueId') || undefined,
      year: searchParams.get('year') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    })

    // Costruisci where clause
    const where: Prisma.BudgetWhereInput = {}

    // Filtra per sede
    where.venueId = await getVenueId()

    if (filters.year) {
      where.year = filters.year
    }

    if (filters.status) {
      where.status = filters.status
    }

    // Query con paginazione
    const [budgets, total] = await Promise.all([
      prisma.budget.findMany({
        where,
        include: {
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          lines: {
            select: {
              annualTotal: true,
            },
          },
          _count: {
            select: {
              lines: true,
              alerts: true,
            },
          },
        },
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.budget.count({ where }),
    ])

    // Formatta risposta con totali calcolati
    const formattedBudgets = budgets.map((budget) => {
      const totalBudget = budget.lines.reduce(
        (sum, line) => sum + Number(line.annualTotal),
        0
      )

      return {
        id: budget.id,
        venueId: budget.venueId,
        year: budget.year,
        name: budget.name,
        status: budget.status,
        notes: budget.notes,
        createdById: budget.createdById,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt,
        venue: budget.venue,
        createdBy: budget.createdBy,
        totalBudget,
        lineCount: budget._count.lines,
        alertsCount: budget._count.alerts,
      }
    })

    return NextResponse.json({
      data: formattedBudgets,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/budget', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei budget' },
      { status: 500 }
    )
  }
}

// POST /api/budget - Crea nuovo budget
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin o manager possono creare budget
    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Non hai i permessi per creare budget' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createBudgetSchema.parse(body)

    // Verifica che non esista già un budget per la stessa sede e anno
    const existing = await prisma.budget.findUnique({
      where: {
        venueId_year: {
          venueId: validatedData.venueId,
          year: validatedData.year,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: `Esiste già un budget per l'anno ${validatedData.year}` },
        { status: 409 }
      )
    }

    // Se richiesto, copia da anno precedente
    let linesToCopy: Prisma.BudgetLineUncheckedCreateWithoutBudgetInput[] = []
    if (validatedData.copyFromYear) {
      const previousBudget = await prisma.budget.findUnique({
        where: {
          venueId_year: {
            venueId: validatedData.venueId,
            year: validatedData.copyFromYear,
          },
        },
        include: {
          lines: true,
        },
      })

      if (previousBudget) {
        linesToCopy = previousBudget.lines.map((line) => ({
          accountId: line.accountId,
          jan: line.jan,
          feb: line.feb,
          mar: line.mar,
          apr: line.apr,
          may: line.may,
          jun: line.jun,
          jul: line.jul,
          aug: line.aug,
          sep: line.sep,
          oct: line.oct,
          nov: line.nov,
          dec: line.dec,
          annualTotal: line.annualTotal,
          notes: line.notes,
        }))
      }
    }

    // Crea il budget (con righe se copia da anno precedente)
    const budget = await prisma.budget.create({
      data: {
        venueId: validatedData.venueId,
        year: validatedData.year,
        name: validatedData.name || `Budget ${validatedData.year}`,
        notes: validatedData.notes,
        createdById: session.user.id,
        lines: linesToCopy.length > 0
          ? {
              create: linesToCopy,
            }
          : undefined,
      },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { lines: true },
        },
      },
    })

    return NextResponse.json(
      {
        ...budget,
        lineCount: budget._count.lines,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/budget', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del budget' },
      { status: 500 }
    )
  }
}
