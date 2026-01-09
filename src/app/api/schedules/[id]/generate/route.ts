import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { generateShifts, saveAssignments } from '@/lib/shift-generation'

// Schema per parametri generazione
const generateParamsSchema = z.object({
  preferFixedStaff: z.boolean().default(true),
  balanceHours: z.boolean().default(true),
  minimizeCost: z.boolean().default(false),
  staffingRequirements: z.record(z.string(), z.number()).optional(),
})

// POST /api/schedules/[id]/generate - Genera turni con algoritmo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono generare turni
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const genParams = generateParamsSchema.parse(body)

    // Verifica esistenza pianificazione
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    // Manager può generare solo per la propria sede
    if (
      session.user.role === 'manager' &&
      schedule.venueId !== session.user.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Verifica stato: può generare solo in DRAFT o GENERATED
    if (!['DRAFT', 'GENERATED'].includes(schedule.status)) {
      return NextResponse.json(
        { error: 'Puoi generare turni solo per pianificazioni in bozza' },
        { status: 400 }
      )
    }

    // Verifica che esistano definizioni turno
    const shiftDefs = await prisma.shiftDefinition.count({
      where: {
        venueId: schedule.venueId,
        isActive: true,
      },
    })

    if (shiftDefs === 0) {
      return NextResponse.json(
        { error: 'Nessuna definizione turno attiva per questa sede' },
        { status: 400 }
      )
    }

    // Genera turni
    const result = await generateShifts(id, {
      venueId: schedule.venueId,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      ...genParams,
    })

    // Salva assegnazioni
    await saveAssignments(id, result.assignments)

    // Aggiorna stato pianificazione
    await prisma.shiftSchedule.update({
      where: { id },
      data: {
        status: 'GENERATED',
        generationLog: {
          generatedAt: new Date().toISOString(),
          params: genParams,
          stats: result.stats,
          warnings: result.warnings,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      success: result.success,
      stats: result.stats,
      warnings: result.warnings,
      assignmentsCreated: result.assignments.length,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/schedules/[id]/generate:', error)
    return NextResponse.json(
      { error: 'Errore nella generazione dei turni' },
      { status: 500 }
    )
  }
}
