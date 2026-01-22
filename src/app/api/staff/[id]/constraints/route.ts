import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per creazione vincolo dipendente
const createConstraintSchema = z.object({
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
  venueId: z.string().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  priority: z.number().min(1).max(10).default(5),
  isHardConstraint: z.boolean().default(true),
  notes: z.string().nullable().optional(),
})

// GET /api/staff/[id]/constraints - Lista vincoli dipendente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono vedere i vincoli
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Verifica che il dipendente esista
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    const constraints = await prisma.employeeConstraint.findMany({
      where: { userId: id },
      include: {
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
        { constraintType: 'asc' },
      ],
    })

    return NextResponse.json({ data: constraints })
  } catch (error) {
    logger.error('Errore GET /api/staff/[id]/constraints', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei vincoli' },
      { status: 500 }
    )
  }
}

// POST /api/staff/[id]/constraints - Crea nuovo vincolo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono creare vincoli
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = createConstraintSchema.parse(body)

    // Verifica che il dipendente esista
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, venueId: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    // Manager può creare vincoli solo per dipendenti della stessa sede
    if (session.user.role === 'manager' && user.venueId !== session.user.venueId) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    const constraint = await prisma.employeeConstraint.create({
      data: {
        userId: id,
        constraintType: validatedData.constraintType,
        config: validatedData.config as Prisma.InputJsonValue,
        venueId: validatedData.venueId || null,
        validFrom: validatedData.validFrom ? new Date(validatedData.validFrom) : null,
        validTo: validatedData.validTo ? new Date(validatedData.validTo) : null,
        priority: validatedData.priority,
        isHardConstraint: validatedData.isHardConstraint,
        notes: validatedData.notes || null,
        createdById: session.user.id,
      },
      include: {
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

    logger.error('Errore POST /api/staff/[id]/constraints', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del vincolo' },
      { status: 500 }
    )
  }
}
