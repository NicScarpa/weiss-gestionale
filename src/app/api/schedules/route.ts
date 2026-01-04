import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per creazione pianificazione
const createScheduleSchema = z.object({
  venueId: z.string(),
  name: z.string().optional(),
  startDate: z.string(), // ISO date
  endDate: z.string(), // ISO date
  notes: z.string().optional(),
})

// GET /api/schedules - Lista pianificazioni
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const status = searchParams.get('status')
    const includeArchived = searchParams.get('includeArchived') === 'true'

    const whereClause: Record<string, unknown> = {}

    if (venueId) {
      whereClause.venueId = venueId
    } else if (session.user.role === 'manager' && session.user.venueId) {
      whereClause.venueId = session.user.venueId
    }

    if (status) {
      whereClause.status = status
    }

    if (!includeArchived) {
      whereClause.status = { not: 'ARCHIVED' }
    }

    const schedules = await prisma.shiftSchedule.findMany({
      where: whereClause,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            assignments: true,
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    })

    return NextResponse.json({ data: schedules })
  } catch (error) {
    console.error('Errore GET /api/schedules:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle pianificazioni' },
      { status: 500 }
    )
  }
}

// POST /api/schedules - Crea nuova pianificazione
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono creare pianificazioni
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createScheduleSchema.parse(body)

    // Manager può creare solo per la propria sede
    if (session.user.role === 'manager' && validatedData.venueId !== session.user.venueId) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Verifica che la sede esista
    const venue = await prisma.venue.findUnique({
      where: { id: validatedData.venueId },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    const startDate = new Date(validatedData.startDate)
    const endDate = new Date(validatedData.endDate)

    if (endDate < startDate) {
      return NextResponse.json(
        { error: 'La data fine deve essere successiva alla data inizio' },
        { status: 400 }
      )
    }

    // Verifica sovrapposizione con pianificazioni esistenti (non archiviate)
    const overlapping = await prisma.shiftSchedule.findFirst({
      where: {
        venueId: validatedData.venueId,
        status: { not: 'ARCHIVED' },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        ],
      },
    })

    if (overlapping) {
      return NextResponse.json(
        { error: 'Esiste già una pianificazione attiva per questo periodo' },
        { status: 400 }
      )
    }

    // Genera nome automatico se non fornito
    const name = validatedData.name || `Settimana ${startDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} - ${endDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`

    const schedule = await prisma.shiftSchedule.create({
      data: {
        venueId: validatedData.venueId,
        name,
        startDate,
        endDate,
        status: 'DRAFT',
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

    return NextResponse.json(schedule, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/schedules:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della pianificazione' },
      { status: 500 }
    )
  }
}
