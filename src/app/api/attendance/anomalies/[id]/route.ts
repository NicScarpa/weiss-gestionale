import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/attendance/anomalies/[id] - Dettaglio anomalia
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const anomaly = await prisma.attendanceAnomaly.findUnique({
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
        record: {
          select: {
            id: true,
            punchType: true,
            punchMethod: true,
            punchedAt: true,
            latitude: true,
            longitude: true,
            distanceFromVenue: true,
            isWithinRadius: true,
            deviceInfo: true,
          },
        },
        assignment: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            actualStart: true,
            actualEnd: true,
            shiftDefinition: {
              select: {
                name: true,
                code: true,
                color: true,
              },
            },
          },
        },
      },
    })

    if (!anomaly) {
      return NextResponse.json(
        { error: 'Anomalia non trovata' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: anomaly })
  } catch (error) {
    console.error('Errore GET /api/attendance/anomalies/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dell\'anomalia' },
      { status: 500 }
    )
  }
}

// Schema per risoluzione
const resolveSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional(),
})

// PUT /api/attendance/anomalies/[id] - Risolvi anomalia
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica ruolo
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    })

    if (!user || !['admin', 'manager'].includes(user.role.name)) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = resolveSchema.parse(body)

    const anomaly = await prisma.attendanceAnomaly.findUnique({
      where: { id },
    })

    if (!anomaly) {
      return NextResponse.json(
        { error: 'Anomalia non trovata' },
        { status: 404 }
      )
    }

    if (anomaly.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Anomalia già risolta' },
        { status: 400 }
      )
    }

    // Aggiorna anomalia
    const updated = await prisma.attendanceAnomaly.update({
      where: { id },
      data: {
        status: validatedData.action,
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
        resolutionNotes: validatedData.notes ?? null,
      },
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

    return NextResponse.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PUT /api/attendance/anomalies/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nella risoluzione dell\'anomalia' },
      { status: 500 }
    )
  }
}
