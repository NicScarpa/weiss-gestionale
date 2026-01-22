import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per creazione turno
const createShiftDefSchema = z.object({
  venueId: z.string(),
  name: z.string().min(1),
  code: z.string().min(1).max(5),
  color: z.string().nullable().optional(),
  startTime: z.string(), // HH:MM format
  endTime: z.string(), // HH:MM format
  breakMinutes: z.number().min(0).default(0),
  minStaff: z.number().min(1).default(1),
  maxStaff: z.number().nullable().optional(),
  requiredSkills: z.array(z.string()).default([]),
  rateMultiplier: z.number().min(0).default(1),
  position: z.number().default(0),
})

// Converte stringa HH:MM in Date
function parseTimeToDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date
}

// GET /api/shift-definitions - Lista definizioni turni
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const whereClause: Record<string, unknown> = {}

    if (venueId) {
      whereClause.venueId = venueId
    } else if (session.user.role === 'manager' && session.user.venueId) {
      whereClause.venueId = session.user.venueId
    }

    if (!includeInactive) {
      whereClause.isActive = true
    }

    const shiftDefinitions = await prisma.shiftDefinition.findMany({
      where: whereClause,
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
        { position: 'desc' },
        { startTime: 'asc' },
      ],
    })

    // Formatta gli orari per il frontend
    const formatted = shiftDefinitions.map(sd => ({
      ...sd,
      startTime: sd.startTime.toTimeString().substring(0, 5),
      endTime: sd.endTime.toTimeString().substring(0, 5),
      rateMultiplier: Number(sd.rateMultiplier),
    }))

    return NextResponse.json({ data: formatted })
  } catch (error) {
    logger.error('Errore GET /api/shift-definitions', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle definizioni turni' },
      { status: 500 }
    )
  }
}

// POST /api/shift-definitions - Crea nuova definizione turno
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono creare turni
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createShiftDefSchema.parse(body)

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

    // Verifica unicità codice per sede
    const existingCode = await prisma.shiftDefinition.findFirst({
      where: {
        venueId: validatedData.venueId,
        code: validatedData.code,
      },
    })

    if (existingCode) {
      return NextResponse.json(
        { error: 'Codice turno già esistente per questa sede' },
        { status: 400 }
      )
    }

    const shiftDefinition = await prisma.shiftDefinition.create({
      data: {
        venueId: validatedData.venueId,
        name: validatedData.name,
        code: validatedData.code,
        color: validatedData.color || null,
        startTime: parseTimeToDate(validatedData.startTime),
        endTime: parseTimeToDate(validatedData.endTime),
        breakMinutes: validatedData.breakMinutes,
        minStaff: validatedData.minStaff,
        maxStaff: validatedData.maxStaff || null,
        requiredSkills: validatedData.requiredSkills,
        rateMultiplier: validatedData.rateMultiplier,
        position: validatedData.position,
        isActive: true,
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

    return NextResponse.json({
      ...shiftDefinition,
      startTime: shiftDefinition.startTime.toTimeString().substring(0, 5),
      endTime: shiftDefinition.endTime.toTimeString().substring(0, 5),
      rateMultiplier: Number(shiftDefinition.rateMultiplier),
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/shift-definitions', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della definizione turno' },
      { status: 500 }
    )
  }
}
