import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per aggiornamento vincolo relazionale
const updateRelConstraintSchema = z.object({
  constraintType: z.enum([
    'SAME_DAY_OFF',
    'NEVER_TOGETHER',
    'ALWAYS_TOGETHER',
    'MIN_OVERLAP',
    'MAX_TOGETHER',
  ]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  venueId: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  priority: z.number().min(1).max(10).optional(),
  isHardConstraint: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  userIds: z.array(z.string()).min(2, 'Almeno due dipendenti richiesti').optional(),
})

// GET /api/relationship-constraints/[id] - Dettaglio singolo vincolo
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

    const constraint = await prisma.relationshipConstraint.findUnique({
      where: { id },
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
    })

    if (!constraint) {
      return NextResponse.json({ error: 'Vincolo non trovato' }, { status: 404 })
    }

    return NextResponse.json(constraint)
  } catch (error) {
    logger.error('Errore GET /api/relationship-constraints/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del vincolo' },
      { status: 500 }
    )
  }
}

// PUT /api/relationship-constraints/[id] - Aggiorna vincolo
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
    const validatedData = updateRelConstraintSchema.parse(body)

    // Verifica che il vincolo esista
    const existingConstraint = await prisma.relationshipConstraint.findUnique({
      where: { id },
      include: {
        users: true,
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
      updateData.config = validatedData.config as Prisma.InputJsonValue
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

    // Se aggiorniamo gli utenti, elimina i vecchi e crea i nuovi
    if (validatedData.userIds !== undefined) {
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

      // Elimina vecchi collegamenti
      await prisma.relationshipConstraintUser.deleteMany({
        where: { constraintId: id },
      })

      // Aggiungi nuovi collegamenti
      updateData.users = {
        create: validatedData.userIds.map(userId => ({
          userId,
        })),
      }
    }

    const updatedConstraint = await prisma.relationshipConstraint.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json(updatedConstraint)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/relationship-constraints/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del vincolo' },
      { status: 500 }
    )
  }
}

// DELETE /api/relationship-constraints/[id] - Elimina vincolo
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
    const existingConstraint = await prisma.relationshipConstraint.findUnique({
      where: { id },
    })

    if (!existingConstraint) {
      return NextResponse.json({ error: 'Vincolo non trovato' }, { status: 404 })
    }

    // Elimina prima i collegamenti (cascade non è automatico per many-to-many esplicito)
    await prisma.relationshipConstraintUser.deleteMany({
      where: { constraintId: id },
    })

    // Elimina il vincolo
    await prisma.relationshipConstraint.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Vincolo relazionale eliminato con successo' })
  } catch (error) {
    logger.error('Errore DELETE /api/relationship-constraints/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del vincolo' },
      { status: 500 }
    )
  }
}
