import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per aggiornamento turno
const updateShiftDefSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(5).optional(),
  color: z.string().nullable().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakMinutes: z.number().min(0).optional(),
  minStaff: z.number().min(1).optional(),
  maxStaff: z.number().nullable().optional(),
  requiredSkills: z.array(z.string()).optional(),
  rateMultiplier: z.number().min(0).optional(),
  position: z.number().optional(),
  isActive: z.boolean().optional(),
})

// Converte stringa HH:MM in Date
function parseTimeToDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date
}

// GET /api/shift-definitions/[id] - Dettaglio singola definizione
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const shiftDefinition = await prisma.shiftDefinition.findUnique({
      where: { id },
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

    if (!shiftDefinition) {
      return NextResponse.json({ error: 'Definizione turno non trovata' }, { status: 404 })
    }

    // Manager può vedere solo turni della propria sede
    if (
      session.user.role === 'manager' &&
      shiftDefinition.venueId !== session.user.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    return NextResponse.json({
      ...shiftDefinition,
      startTime: shiftDefinition.startTime.toTimeString().substring(0, 5),
      endTime: shiftDefinition.endTime.toTimeString().substring(0, 5),
      rateMultiplier: Number(shiftDefinition.rateMultiplier),
    })
  } catch (error) {
    logger.error('Errore GET /api/shift-definitions/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della definizione turno' },
      { status: 500 }
    )
  }
}

// PUT /api/shift-definitions/[id] - Aggiorna definizione
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono modificare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = updateShiftDefSchema.parse(body)

    // Verifica esistenza
    const existingShift = await prisma.shiftDefinition.findUnique({
      where: { id },
    })

    if (!existingShift) {
      return NextResponse.json({ error: 'Definizione turno non trovata' }, { status: 404 })
    }

    // Manager può modificare solo turni della propria sede
    if (
      session.user.role === 'manager' &&
      existingShift.venueId !== session.user.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Verifica unicità codice se modificato
    if (validatedData.code && validatedData.code !== existingShift.code) {
      const duplicateCode = await prisma.shiftDefinition.findFirst({
        where: {
          venueId: existingShift.venueId,
          code: validatedData.code,
          id: { not: id },
        },
      })

      if (duplicateCode) {
        return NextResponse.json(
          { error: 'Codice turno già esistente per questa sede' },
          { status: 400 }
        )
      }
    }

    // Prepara dati per update
    const updateData: Record<string, unknown> = {}

    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.code !== undefined) updateData.code = validatedData.code
    if (validatedData.color !== undefined) updateData.color = validatedData.color
    if (validatedData.startTime !== undefined) updateData.startTime = parseTimeToDate(validatedData.startTime)
    if (validatedData.endTime !== undefined) updateData.endTime = parseTimeToDate(validatedData.endTime)
    if (validatedData.breakMinutes !== undefined) updateData.breakMinutes = validatedData.breakMinutes
    if (validatedData.minStaff !== undefined) updateData.minStaff = validatedData.minStaff
    if (validatedData.maxStaff !== undefined) updateData.maxStaff = validatedData.maxStaff
    if (validatedData.requiredSkills !== undefined) updateData.requiredSkills = validatedData.requiredSkills
    if (validatedData.rateMultiplier !== undefined) updateData.rateMultiplier = validatedData.rateMultiplier
    if (validatedData.position !== undefined) updateData.position = validatedData.position
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive

    const updated = await prisma.shiftDefinition.update({
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
      },
    })

    return NextResponse.json({
      ...updated,
      startTime: updated.startTime.toTimeString().substring(0, 5),
      endTime: updated.endTime.toTimeString().substring(0, 5),
      rateMultiplier: Number(updated.rateMultiplier),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/shift-definitions/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della definizione turno' },
      { status: 500 }
    )
  }
}

// DELETE /api/shift-definitions/[id] - Elimina (disattiva) definizione
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può eliminare
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Solo gli admin possono eliminare turni' }, { status: 403 })
    }

    const { id } = await params

    // Verifica esistenza
    const existingShift = await prisma.shiftDefinition.findUnique({
      where: { id },
    })

    if (!existingShift) {
      return NextResponse.json({ error: 'Definizione turno non trovata' }, { status: 404 })
    }

    // Verifica se ci sono assegnazioni attive
    const activeAssignments = await prisma.shiftAssignment.count({
      where: {
        shiftDefinitionId: id,
        date: { gte: new Date() },
      },
    })

    if (activeAssignments > 0) {
      // Disattiva invece di eliminare
      await prisma.shiftDefinition.update({
        where: { id },
        data: { isActive: false },
      })

      return NextResponse.json({
        message: 'Definizione turno disattivata (esistono assegnazioni future)',
        deactivated: true,
      })
    }

    // Elimina definitivamente
    await prisma.shiftDefinition.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Definizione turno eliminata con successo' })
  } catch (error) {
    logger.error('Errore DELETE /api/shift-definitions/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della definizione turno' },
      { status: 500 }
    )
  }
}
