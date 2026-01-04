import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

// Schema per creazione vincolo relazionale
const createRelConstraintSchema = z.object({
  constraintType: z.enum([
    'SAME_DAY_OFF',
    'NEVER_TOGETHER',
    'ALWAYS_TOGETHER',
    'MIN_OVERLAP',
    'MAX_TOGETHER',
  ]),
  config: z.record(z.string(), z.unknown()).default({}),
  venueId: z.string().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  priority: z.number().min(1).max(10).default(5),
  isHardConstraint: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  userIds: z.array(z.string()).min(2, 'Almeno due dipendenti richiesti'),
})

// GET /api/relationship-constraints - Lista vincoli relazionali
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono vedere i vincoli
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')

    const whereClause: Record<string, unknown> = {}

    // Manager vede solo vincoli della propria sede
    if (session.user.role === 'manager') {
      whereClause.venueId = session.user.venueId
    } else if (venueId) {
      whereClause.venueId = venueId
    }

    const constraints = await prisma.relationshipConstraint.findMany({
      where: whereClause,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        users: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { constraintType: 'asc' },
      ],
    })

    return NextResponse.json({ data: constraints })
  } catch (error) {
    console.error('Errore GET /api/relationship-constraints:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei vincoli relazionali' },
      { status: 500 }
    )
  }
}

// POST /api/relationship-constraints - Crea nuovo vincolo relazionale
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono creare vincoli
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createRelConstraintSchema.parse(body)

    // Verifica che tutti gli utenti esistano
    const users = await prisma.user.findMany({
      where: {
        id: { in: validatedData.userIds },
      },
      select: { id: true, venueId: true },
    })

    if (users.length !== validatedData.userIds.length) {
      return NextResponse.json(
        { error: 'Uno o più dipendenti non trovati' },
        { status: 404 }
      )
    }

    // Manager può creare vincoli solo per dipendenti della stessa sede
    if (session.user.role === 'manager') {
      const allSameVenue = users.every(u => u.venueId === session.user.venueId)
      if (!allSameVenue) {
        return NextResponse.json(
          { error: 'Puoi creare vincoli solo per dipendenti della tua sede' },
          { status: 403 }
        )
      }
    }

    // Crea il vincolo con i collegamenti agli utenti
    const constraint = await prisma.relationshipConstraint.create({
      data: {
        constraintType: validatedData.constraintType,
        config: validatedData.config as Prisma.InputJsonValue,
        venueId: validatedData.venueId || (session.user.role === 'manager' ? session.user.venueId : null),
        validFrom: validatedData.validFrom ? new Date(validatedData.validFrom) : null,
        validTo: validatedData.validTo ? new Date(validatedData.validTo) : null,
        priority: validatedData.priority,
        isHardConstraint: validatedData.isHardConstraint,
        notes: validatedData.notes || null,
        createdById: session.user.id,
        users: {
          create: validatedData.userIds.map(userId => ({
            userId,
          })),
        },
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        users: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json(constraint, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/relationship-constraints:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del vincolo relazionale' },
      { status: 500 }
    )
  }
}
