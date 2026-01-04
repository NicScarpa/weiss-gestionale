import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/attendance/today - Timbrature di oggi
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')

    // Data di oggi
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const punches = await prisma.attendanceRecord.findMany({
      where: {
        userId: session.user.id,
        punchedAt: {
          gte: today,
          lt: tomorrow,
        },
        ...(venueId && { venueId }),
      },
      orderBy: { punchedAt: 'asc' },
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

    // Formatta i dati
    const formattedPunches = punches.map((punch) => ({
      id: punch.id,
      type: punch.punchType,
      method: punch.punchMethod,
      time: punch.punchedAt,
      venue: punch.venue,
      isWithinRadius: punch.isWithinRadius,
      distanceFromVenue: punch.distanceFromVenue
        ? Number(punch.distanceFromVenue)
        : null,
      notes: punch.notes,
      isManual: punch.isManual,
    }))

    // Calcola statistiche
    const clockIn = punches.find((p) => p.punchType === 'IN')
    const clockOut = punches
      .filter((p) => p.punchType === 'OUT')
      .pop()
    const breakStart = punches
      .filter((p) => p.punchType === 'BREAK_START')
      .pop()
    const breakEnd = punches
      .filter((p) => p.punchType === 'BREAK_END')
      .pop()

    let totalMinutesWorked = 0
    let totalBreakMinutes = 0

    if (clockIn) {
      const endTime = clockOut?.punchedAt ?? new Date()
      totalMinutesWorked = Math.round(
        (endTime.getTime() - clockIn.punchedAt.getTime()) / (1000 * 60)
      )
    }

    if (breakStart && breakEnd) {
      totalBreakMinutes = Math.round(
        (breakEnd.punchedAt.getTime() - breakStart.punchedAt.getTime()) /
          (1000 * 60)
      )
    } else if (breakStart && !breakEnd) {
      // Ancora in pausa
      totalBreakMinutes = Math.round(
        (new Date().getTime() - breakStart.punchedAt.getTime()) / (1000 * 60)
      )
    }

    const netMinutesWorked = Math.max(0, totalMinutesWorked - totalBreakMinutes)

    return NextResponse.json({
      data: formattedPunches,
      summary: {
        totalPunches: punches.length,
        clockInTime: clockIn?.punchedAt ?? null,
        clockOutTime: clockOut?.punchedAt ?? null,
        totalMinutesWorked,
        totalBreakMinutes,
        netMinutesWorked,
        netHoursWorked: Math.round((netMinutesWorked / 60) * 100) / 100,
      },
    })
  } catch (error) {
    console.error('Errore GET /api/attendance/today:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle timbrature' },
      { status: 500 }
    )
  }
}
