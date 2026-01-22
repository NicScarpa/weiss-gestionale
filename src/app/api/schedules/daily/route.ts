import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/schedules/daily - Turni per una data specifica
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const venueId = searchParams.get('venueId')

    if (!date) {
      return NextResponse.json({ error: 'Data obbligatoria' }, { status: 400 })
    }

    const targetDate = new Date(date)

    const whereClause: Record<string, unknown> = {
      date: targetDate,
      schedule: {
        status: 'PUBLISHED',
      },
    }

    if (venueId) {
      whereClause.venueId = venueId
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            isFixedStaff: true,
            contractType: true,
            hourlyRateBase: true,
            hourlyRateExtra: true,
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
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { startTime: 'asc' },
        { user: { lastName: 'asc' } },
      ],
    })

    // Formatta i dati per l'uso nella chiusura cassa
    const formattedAssignments = assignments.map((a) => {
      // Calcola ore scheduled
      const startTime = new Date(a.startTime)
      const endTime = new Date(a.endTime)
      let scheduledHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
      scheduledHours -= (a.breakMinutes || 0) / 60

      // Determina tariffa: isFixedStaff=true significa EXTRA (logica invertita nello switch UI)
      // Staff fisso (isFixedStaff=false) usa tariffa base, EXTRA (isFixedStaff=true) usa tariffa extra
      const hourlyRate = a.user.isFixedStaff
        ? a.user.hourlyRateExtra || a.user.hourlyRateBase
        : a.user.hourlyRateBase

      return {
        id: a.id,
        userId: a.userId,
        userName: `${a.user.firstName} ${a.user.lastName}`,
        shiftCode: a.shiftDefinition?.code || '',
        shiftName: a.shiftDefinition?.name || '',
        shiftColor: a.shiftDefinition?.color || '#6B7280',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        scheduledHours: Math.round(scheduledHours * 100) / 100,
        isFixedStaff: a.user.isFixedStaff,
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
        venueId: a.venueId,
        venueName: a.venue?.name,
        status: a.status,
      }
    })

    return NextResponse.json({ data: formattedAssignments })
  } catch (error) {
    logger.error('Errore GET /api/schedules/daily', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei turni' },
      { status: 500 }
    )
  }
}
