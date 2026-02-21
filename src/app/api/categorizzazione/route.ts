import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getVenueId } from '@/lib/venue'

const createRuleSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(['INFLOW', 'OUTFLOW']),
  keywords: z.array(z.string()).default([]),
  priority: z.number().min(1).max(10).default(5),
  isActive: z.boolean().default(true),
  budgetCategoryId: z.string().optional(),
  accountId: z.string().optional(),
  autoVerify: z.boolean().default(false),
  autoHide: z.boolean().default(false),
})

/**
 * GET /api/categorizzazione
 * Lista regole di categorizzazione
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = await getVenueId()

    const rules = await prisma.categorizationRule.findMany({
      where: { venueId },
      include: {
        budgetCategory: {
          select: { id: true, code: true, name: true, color: true },
        },
        account: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json(rules)
  } catch (error) {
    console.error('Errore GET /api/categorizzazione', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle regole' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/categorizzazione
 * Crea nuova regola di categorizzazione
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validated = createRuleSchema.parse(body)

    const rule = await prisma.categorizationRule.create({
      data: {
        venueId: await getVenueId(),
        ...validated,
      },
      include: {
        budgetCategory: {
          select: { id: true, code: true, name: true, color: true },
        },
        account: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/categorizzazione', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della regola' },
      { status: 500 }
    )
  }
}
