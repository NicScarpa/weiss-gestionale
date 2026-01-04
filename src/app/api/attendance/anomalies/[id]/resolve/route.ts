import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyAnomalyResolved } from '@/lib/notifications'

interface RouteParams {
  params: Promise<{ id: string }>
}

const resolveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional(),
})

// POST /api/attendance/anomalies/[id]/resolve - Risolvi anomalia
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica ruolo manager/admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    })

    if (!user || !['admin', 'manager'].includes(user.role.name)) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Trova l'anomalia
    const anomaly = await prisma.attendanceAnomaly.findUnique({
      where: { id },
      include: {
        venue: true,
      },
    })

    if (!anomaly) {
      return NextResponse.json({ error: 'Anomalia non trovata' }, { status: 404 })
    }

    // Se manager, verifica stessa sede
    if (user.role.name === 'manager' && user.venueId !== anomaly.venueId) {
      return NextResponse.json(
        { error: 'Non puoi risolvere anomalie di altre sedi' },
        { status: 403 }
      )
    }

    // Verifica che sia in stato PENDING
    if (anomaly.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Anomalia già risolta' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validatedData = resolveSchema.parse(body)

    // Aggiorna l'anomalia
    const updatedAnomaly = await prisma.attendanceAnomaly.update({
      where: { id },
      data: {
        status: validatedData.status,
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
        resolutionNotes: validatedData.notes || null,
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

    // Notifica al dipendente che l'anomalia è stata risolta (async)
    notifyAnomalyResolved(id).catch((err) =>
      console.error('Errore invio notifica anomalia risolta:', err)
    )

    return NextResponse.json({
      success: true,
      data: updatedAnomaly,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/attendance/anomalies/[id]/resolve:', error)
    return NextResponse.json(
      { error: "Errore nella risoluzione dell'anomalia" },
      { status: 500 }
    )
  }
}
