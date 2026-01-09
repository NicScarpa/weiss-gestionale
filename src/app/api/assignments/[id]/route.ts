import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per aggiornamento assegnazione
const updateAssignmentSchema = z.object({
  userId: z.string().optional(),
  shiftDefinitionId: z.string().nullable().optional(),
  startTime: z.string().optional(), // HH:MM
  endTime: z.string().optional(), // HH:MM
  breakMinutes: z.number().min(0).optional(),
  workStation: z.string().nullable().optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'ABSENT', 'WORKED']).optional(),
  notes: z.string().nullable().optional(),
})

// Converte stringa HH:MM in Date
function parseTimeToDate(timeStr: string, baseDate: Date): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const date = new Date(baseDate)
  date.setHours(hours, minutes, 0, 0)
  return date
}

// GET /api/assignments/[id] - Dettaglio assegnazione
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

    const assignment = await prisma.shiftAssignment.findUnique({
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
        shiftDefinition: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
            startTime: true,
            endTime: true,
          },
        },
        schedule: {
          select: {
            id: true,
            name: true,
            status: true,
            venueId: true,
          },
        },
      },
    })

    if (!assignment) {
      return NextResponse.json({ error: 'Assegnazione non trovata' }, { status: 404 })
    }

    // Staff può vedere solo le proprie assegnazioni
    if (
      session.user.role === 'staff' &&
      assignment.userId !== session.user.id
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Manager può vedere solo la propria sede
    if (
      session.user.role === 'manager' &&
      assignment.venueId !== session.user.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    return NextResponse.json({
      ...assignment,
      startTime: assignment.startTime.toTimeString().substring(0, 5),
      endTime: assignment.endTime.toTimeString().substring(0, 5),
      hoursScheduled: assignment.hoursScheduled ? Number(assignment.hoursScheduled) : null,
      costEstimated: assignment.costEstimated ? Number(assignment.costEstimated) : null,
      shiftDefinition: assignment.shiftDefinition ? {
        ...assignment.shiftDefinition,
        startTime: assignment.shiftDefinition.startTime.toTimeString().substring(0, 5),
        endTime: assignment.shiftDefinition.endTime.toTimeString().substring(0, 5),
      } : null,
    })
  } catch (error) {
    console.error('Errore GET /api/assignments/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dell\'assegnazione' },
      { status: 500 }
    )
  }
}

// PUT /api/assignments/[id] - Aggiorna assegnazione
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = updateAssignmentSchema.parse(body)

    // Verifica esistenza
    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id },
      include: {
        schedule: {
          select: {
            status: true,
            venueId: true,
          },
        },
      },
    })

    if (!assignment) {
      return NextResponse.json({ error: 'Assegnazione non trovata' }, { status: 404 })
    }

    // Manager può modificare solo la propria sede
    if (
      session.user.role === 'manager' &&
      assignment.venueId !== session.user.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Nota: permettiamo la modifica anche su pianificazioni pubblicate
    // per consentire correzioni last-minute ai manager

    const updateData: Record<string, unknown> = {}

    if (validatedData.userId !== undefined) {
      // Verifica che il nuovo utente esista
      const user = await prisma.user.findUnique({
        where: { id: validatedData.userId },
      })
      if (!user) {
        return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
      }
      updateData.userId = validatedData.userId
    }

    if (validatedData.shiftDefinitionId !== undefined) {
      updateData.shiftDefinitionId = validatedData.shiftDefinitionId
    }

    if (validatedData.startTime !== undefined) {
      updateData.startTime = parseTimeToDate(validatedData.startTime, assignment.date)
    }

    if (validatedData.endTime !== undefined) {
      updateData.endTime = parseTimeToDate(validatedData.endTime, assignment.date)
    }

    if (validatedData.breakMinutes !== undefined) {
      updateData.breakMinutes = validatedData.breakMinutes
    }

    if (validatedData.workStation !== undefined) {
      updateData.workStation = validatedData.workStation
    }

    if (validatedData.status !== undefined) {
      updateData.status = validatedData.status
    }

    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes
    }

    // Ricalcola ore se modificati orari
    if (validatedData.startTime || validatedData.endTime || validatedData.breakMinutes !== undefined) {
      const startTime = updateData.startTime as Date || assignment.startTime
      const endTime = updateData.endTime as Date || assignment.endTime
      const breakMinutes = updateData.breakMinutes as number ?? assignment.breakMinutes

      let endMs = endTime.getTime()
      const startMs = startTime.getTime()
      if (endMs < startMs) endMs += 24 * 60 * 60 * 1000
      const totalMinutes = (endMs - startMs) / (1000 * 60)
      const workMinutes = totalMinutes - breakMinutes
      updateData.hoursScheduled = Math.round((workMinutes / 60) * 100) / 100
    }

    const updated = await prisma.shiftAssignment.update({
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
        shiftDefinition: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
      },
    })

    return NextResponse.json({
      ...updated,
      startTime: updated.startTime.toTimeString().substring(0, 5),
      endTime: updated.endTime.toTimeString().substring(0, 5),
      hoursScheduled: updated.hoursScheduled ? Number(updated.hoursScheduled) : null,
      costEstimated: updated.costEstimated ? Number(updated.costEstimated) : null,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PUT /api/assignments/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento dell\'assegnazione' },
      { status: 500 }
    )
  }
}

// DELETE /api/assignments/[id] - Elimina assegnazione
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Verifica esistenza
    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id },
      include: {
        schedule: {
          select: {
            status: true,
            venueId: true,
          },
        },
      },
    })

    if (!assignment) {
      return NextResponse.json({ error: 'Assegnazione non trovata' }, { status: 404 })
    }

    // Manager può eliminare solo dalla propria sede
    if (
      session.user.role === 'manager' &&
      assignment.venueId !== session.user.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Nota: permettiamo la cancellazione anche su pianificazioni pubblicate
    // per consentire correzioni last-minute ai manager

    await prisma.shiftAssignment.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Assegnazione eliminata con successo' })
  } catch (error) {
    console.error('Errore DELETE /api/assignments/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione dell\'assegnazione' },
      { status: 500 }
    )
  }
}
