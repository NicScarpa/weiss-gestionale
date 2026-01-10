import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per aggiornamento pianificazione
const updateScheduleSchema = z.object({
  name: z.string().optional(),
  status: z.enum(['DRAFT', 'GENERATED', 'REVIEW', 'PUBLISHED', 'ARCHIVED']).optional(),
  notes: z.string().nullable().optional(),
})

// GET /api/schedules/[id] - Dettaglio pianificazione
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

    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                isFixedStaff: true,
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
          },
          orderBy: [
            { date: 'asc' },
            { startTime: 'asc' },
          ],
        },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    // Manager può vedere solo pianificazioni della propria sede
    if (
      session.user.role === 'manager' &&
      schedule.venueId !== session.user.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Formatta gli orari
    const formatted = {
      ...schedule,
      assignments: schedule.assignments.map(a => ({
        ...a,
        startTime: a.startTime.toTimeString().substring(0, 5),
        endTime: a.endTime.toTimeString().substring(0, 5),
        hoursScheduled: a.hoursScheduled ? Number(a.hoursScheduled) : null,
        costEstimated: a.costEstimated ? Number(a.costEstimated) : null,
        shiftDefinition: a.shiftDefinition ? {
          ...a.shiftDefinition,
          startTime: a.shiftDefinition.startTime.toTimeString().substring(0, 5),
          endTime: a.shiftDefinition.endTime.toTimeString().substring(0, 5),
        } : null,
      })),
    }

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Errore GET /api/schedules/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della pianificazione' },
      { status: 500 }
    )
  }
}

// PUT /api/schedules/[id] - Aggiorna pianificazione
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
    const validatedData = updateScheduleSchema.parse(body)

    // Verifica esistenza
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    // Manager può modificare solo la propria sede
    if (
      session.user.role === 'manager' &&
      schedule.venueId !== session.user.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Verifica stato: non si può modificare se pubblicata (tranne admin)
    if (schedule.status === 'PUBLISHED' && session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Non puoi modificare una pianificazione già pubblicata' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}

    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.status !== undefined) updateData.status = validatedData.status
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes

    const updated = await prisma.shiftSchedule.update({
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

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PUT /api/schedules/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della pianificazione' },
      { status: 500 }
    )
  }
}

// DELETE /api/schedules/[id] - Elimina (archivia) pianificazione
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono eliminare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Verifica esistenza
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    // Se pubblicata, archivia invece di eliminare
    if (schedule.status === 'PUBLISHED') {
      await prisma.shiftSchedule.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      })

      return NextResponse.json({
        message: 'Pianificazione archiviata',
        archived: true,
      })
    }

    // Se bozza, elimina con le assegnazioni
    await prisma.shiftAssignment.deleteMany({
      where: { scheduleId: id },
    })

    await prisma.shiftSchedule.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Pianificazione eliminata con successo' })
  } catch (error) {
    console.error('Errore DELETE /api/schedules/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della pianificazione' },
      { status: 500 }
    )
  }
}
