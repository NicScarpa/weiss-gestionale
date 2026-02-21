import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema per creazione assegnazione
const createAssignmentSchema = z.object({
  userId: z.string(),
  shiftDefinitionId: z.string().optional(),
  date: z.string(), // ISO date
  startTime: z.string(), // HH:MM
  endTime: z.string(), // HH:MM
  breakMinutes: z.number().min(0).default(0),
  workStation: z.string().optional(),
  notes: z.string().optional(),
})

// Converte stringa HH:MM in Date
function parseTimeToDate(timeStr: string, baseDate: Date): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const date = new Date(baseDate)
  date.setHours(hours, minutes, 0, 0)
  return date
}

// GET /api/schedules/[id]/assignments - Lista assegnazioni
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

    // Verifica esistenza pianificazione
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: { scheduleId: id },
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
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { startTime: 'asc' },
      ],
    })

    // Formatta per frontend
    const formatted = assignments.map(a => ({
      ...a,
      startTime: a.startTime.toTimeString().substring(0, 5),
      endTime: a.endTime.toTimeString().substring(0, 5),
      hoursScheduled: a.hoursScheduled ? Number(a.hoursScheduled) : null,
      costEstimated: a.costEstimated ? Number(a.costEstimated) : null,
    }))

    return NextResponse.json({ data: formatted })
  } catch (error) {
    logger.error('Errore GET /api/schedules/[id]/assignments', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle assegnazioni' },
      { status: 500 }
    )
  }
}

// POST /api/schedules/[id]/assignments - Crea nuova assegnazione manuale
export async function POST(
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
    const validatedData = createAssignmentSchema.parse(body)

    // Verifica esistenza pianificazione
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    // Nota: permettiamo l'aggiunta di turni anche su pianificazioni pubblicate
    // per consentire correzioni last-minute ai manager

    // Verifica che l'utente esista
    const user = await prisma.user.findUnique({
      where: { id: validatedData.userId },
      select: { id: true, hourlyRateBase: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    const date = new Date(validatedData.date)
    const startTime = parseTimeToDate(validatedData.startTime, date)
    const endTime = parseTimeToDate(validatedData.endTime, date)

    // Calcola ore lavorate
    let endMs = endTime.getTime()
    const startMs = startTime.getTime()
    if (endMs < startMs) endMs += 24 * 60 * 60 * 1000 // Overnight
    const totalMinutes = (endMs - startMs) / (1000 * 60)
    const workMinutes = totalMinutes - validatedData.breakMinutes
    const hoursScheduled = Math.round((workMinutes / 60) * 100) / 100

    // Calcola costo stimato
    const hourlyRate = user.hourlyRateBase ? Number(user.hourlyRateBase) : 10
    const costEstimated = hoursScheduled * hourlyRate

    // Verifica assegnazione duplicata
    const existing = await prisma.shiftAssignment.findFirst({
      where: {
        scheduleId: id,
        userId: validatedData.userId,
        date,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Il dipendente ha già un turno in questa data' },
        { status: 400 }
      )
    }

    const assignment = await prisma.shiftAssignment.create({
      data: {
        scheduleId: id,
        userId: validatedData.userId,
        shiftDefinitionId: validatedData.shiftDefinitionId || null,
        date,
        startTime,
        endTime,
        breakMinutes: validatedData.breakMinutes,
        venueId: schedule.venueId,
        workStation: validatedData.workStation || null,
        hoursScheduled,
        costEstimated,
        status: 'SCHEDULED',
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

    // Aggiorna stato pianificazione se era in bozza
    if (schedule.status === 'DRAFT') {
      await prisma.shiftSchedule.update({
        where: { id },
        data: { status: 'REVIEW' },
      })
    }

    return NextResponse.json({
      ...assignment,
      startTime: assignment.startTime.toTimeString().substring(0, 5),
      endTime: assignment.endTime.toTimeString().substring(0, 5),
      hoursScheduled: Number(assignment.hoursScheduled),
      costEstimated: Number(assignment.costEstimated),
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/schedules/[id]/assignments', error)
    return NextResponse.json(
      { error: 'Errore nella creazione dell\'assegnazione' },
      { status: 500 }
    )
  }
}
