import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per aggiornamento vincolo
const updateConstraintSchema = z.object({
  constraintType: z.enum([
    'AVAILABILITY',
    'MAX_HOURS',
    'MIN_REST',
    'PREFERRED_SHIFT',
    'BLOCKED_DAY',
    'SKILL_REQUIRED',
    'CONSECUTIVE_DAYS',
  ]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  venueId: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  priority: z.number().min(1).max(10).optional(),
  isHardConstraint: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

// GET /api/constraints/[id] - Dettaglio singolo vincolo
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

    const constraint = await prisma.employeeConstraint.findUnique({
      where: { id },
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
    })

    if (!constraint) {
      return NextResponse.json({ error: 'Vincolo non trovato' }, { status: 404 })
    }

    return NextResponse.json(constraint)
  } catch (error) {
    logger.error('Errore GET /api/constraints/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del vincolo' },
      { status: 500 }
    )
  }
}

// PUT /api/constraints/[id] - Aggiorna vincolo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono modificare vincoli
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = updateConstraintSchema.parse(body)

    // Verifica che il vincolo esista
    const existingConstraint = await prisma.employeeConstraint.findUnique({
      where: { id },
      include: {
        user: {
          select: { venueId: true },
        },
      },
    })

    if (!existingConstraint) {
      return NextResponse.json({ error: 'Vincolo non trovato' }, { status: 404 })
    }

    // Prepara dati per update
    const updateData: Record<string, unknown> = {}

    if (validatedData.constraintType !== undefined) {
      updateData.constraintType = validatedData.constraintType
    }
    if (validatedData.config !== undefined) {
      updateData.config = validatedData.config
    }
    if (validatedData.venueId !== undefined) {
      updateData.venueId = validatedData.venueId
    }
    if (validatedData.validFrom !== undefined) {
      updateData.validFrom = validatedData.validFrom ? new Date(validatedData.validFrom) : null
    }
    if (validatedData.validTo !== undefined) {
      updateData.validTo = validatedData.validTo ? new Date(validatedData.validTo) : null
    }
    if (validatedData.priority !== undefined) {
      updateData.priority = validatedData.priority
    }
    if (validatedData.isHardConstraint !== undefined) {
      updateData.isHardConstraint = validatedData.isHardConstraint
    }
    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes
    }

    const updatedConstraint = await prisma.employeeConstraint.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json(updatedConstraint)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/constraints/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del vincolo' },
      { status: 500 }
    )
  }
}

// DELETE /api/constraints/[id] - Elimina vincolo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono eliminare vincoli
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Verifica che il vincolo esista
    const existingConstraint = await prisma.employeeConstraint.findUnique({
      where: { id },
      include: {
        user: {
          select: { venueId: true },
        },
      },
    })

    if (!existingConstraint) {
      return NextResponse.json({ error: 'Vincolo non trovato' }, { status: 404 })
    }

    await prisma.employeeConstraint.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Vincolo eliminato con successo' })
  } catch (error) {
    logger.error('Errore DELETE /api/constraints/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del vincolo' },
      { status: 500 }
    )
  }
}
