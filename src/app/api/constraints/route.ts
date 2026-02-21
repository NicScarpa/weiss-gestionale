import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per creazione vincolo
const createConstraintSchema = z.object({
  userId: z.string().min(1, 'userId richiesto'),
  constraintType: z.enum([
    'AVAILABILITY',
    'MAX_HOURS',
    'MIN_REST',
    'PREFERRED_SHIFT',
    'BLOCKED_DAY',
    'SKILL_REQUIRED',
    'CONSECUTIVE_DAYS',
  ]),
  config: z.record(z.string(), z.unknown()),
  venueId: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  priority: z.number().min(1).max(10).default(5),
  isHardConstraint: z.boolean().default(true),
  notes: z.string().nullable().optional(),
})

// GET /api/constraints - Lista vincoli
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
    const userId = searchParams.get('userId')
    const venueId = searchParams.get('venueId')
    const constraintType = searchParams.get('constraintType')

    // Costruisci filtro
    const where: Record<string, unknown> = {}

    if (userId) {
      where.userId = userId
    }

    if (venueId) {
      where.venueId = venueId
    } else {
      where.OR = [
        { venueId: await getVenueId() },
        { venueId: null },
      ]
    }

    if (constraintType) {
      where.constraintType = constraintType
    }

    const constraints = await prisma.employeeConstraint.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({ constraints })
  } catch (error) {
    logger.error('Errore GET /api/constraints', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei vincoli' },
      { status: 500 }
    )
  }
}

// POST /api/constraints - Crea vincolo
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
    const validatedData = createConstraintSchema.parse(body)

    // Verifica che l'utente target esista
    const targetUser = await prisma.user.findUnique({
      where: { id: validatedData.userId },
      select: { id: true, venueId: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    // Crea il vincolo
    const constraint = await prisma.employeeConstraint.create({
      data: {
        userId: validatedData.userId,
        constraintType: validatedData.constraintType,
        config: validatedData.config as Prisma.InputJsonValue,
        venueId: validatedData.venueId || null,
        validFrom: validatedData.validFrom ? new Date(validatedData.validFrom) : null,
        validTo: validatedData.validTo ? new Date(validatedData.validTo) : null,
        priority: validatedData.priority,
        isHardConstraint: validatedData.isHardConstraint,
        notes: validatedData.notes || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
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

    logger.error('Errore POST /api/constraints', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del vincolo' },
      { status: 500 }
    )
  }
}
