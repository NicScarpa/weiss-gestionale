import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/attendance/current - Stato timbratura attuale
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

    // Recupera tutte le timbrature di oggi per questo utente
    const todayPunches = await prisma.attendanceRecord.findMany({
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

    // Determina lo stato attuale
    let status: 'NOT_CLOCKED_IN' | 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' =
      'NOT_CLOCKED_IN'
    let lastPunch = null
    let clockInTime: Date | null = null
    let clockOutTime: Date | null = null
    let breakStartTime: Date | null = null

    if (todayPunches.length > 0) {
      lastPunch = todayPunches[todayPunches.length - 1]

      // Trova l'ultimo clock in e clock out
      const clockIn = todayPunches.filter((p) => p.punchType === 'IN').pop()
      const clockOut = todayPunches.filter((p) => p.punchType === 'OUT').pop()
      const breakStart = todayPunches
        .filter((p) => p.punchType === 'BREAK_START')
        .pop()
      const breakEnd = todayPunches
        .filter((p) => p.punchType === 'BREAK_END')
        .pop()

      if (clockIn) clockInTime = clockIn.punchedAt
      if (clockOut) clockOutTime = clockOut.punchedAt
      if (breakStart) breakStartTime = breakStart.punchedAt

      // Logica stato
      if (clockOut && (!clockIn || clockOut.punchedAt > clockIn.punchedAt)) {
        status = 'CLOCKED_OUT'
      } else if (
        breakStart &&
        (!breakEnd || breakStart.punchedAt > breakEnd.punchedAt)
      ) {
        status = 'ON_BREAK'
      } else if (clockIn) {
        status = 'CLOCKED_IN'
      }
    }

    // Recupera il turno di oggi
    const todayAssignment = await prisma.shiftAssignment.findFirst({
      where: {
        userId: session.user.id,
        date: {
          gte: today,
          lt: tomorrow,
        },
        schedule: {
          status: 'PUBLISHED',
        },
        ...(venueId && { venueId }),
      },
      include: {
        shiftDefinition: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
            latitude: true,
            longitude: true,
            attendancePolicy: {
              select: {
                geoFenceRadius: true,
                requireGeolocation: true,
                blockOutsideLocation: true,
              },
            },
          },
        },
      },
    })

    // Calcola ore lavorate finora
    let hoursWorkedToday = 0
    if (clockInTime) {
      const endTime = clockOutTime ?? new Date()
      hoursWorkedToday =
        Math.round(
          ((endTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60)) * 100
        ) / 100
    }

    return NextResponse.json({
      status,
      clockInTime,
      clockOutTime,
      breakStartTime,
      lastPunch: lastPunch
        ? {
            type: lastPunch.punchType,
            time: lastPunch.punchedAt,
            venue: lastPunch.venue,
          }
        : null,
      todayAssignment: todayAssignment
        ? {
            id: todayAssignment.id,
            startTime: todayAssignment.startTime,
            endTime: todayAssignment.endTime,
            shiftDefinition: todayAssignment.shiftDefinition,
            venue: todayAssignment.venue,
          }
        : null,
      hoursWorkedToday,
      punchCount: todayPunches.length,
    })
  } catch (error) {
    console.error('Errore GET /api/attendance/current:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello stato timbratura' },
      { status: 500 }
    )
  }
}
