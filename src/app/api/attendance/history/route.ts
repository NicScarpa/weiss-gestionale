import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/attendance/history - Storico timbrature personali
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 50
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!)
      : 0

    // Costruisci filtro date
    const dateFilter: Record<string, Date> = {}
    if (from) {
      dateFilter.gte = new Date(from)
    }
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      dateFilter.lte = toDate
    }

    const [punches, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: {
          userId: session.user.id,
          ...(venueId && { venueId }),
          ...(Object.keys(dateFilter).length > 0 && { punchedAt: dateFilter }),
        },
        orderBy: { punchedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          assignment: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
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
      }),
      prisma.attendanceRecord.count({
        where: {
          userId: session.user.id,
          ...(venueId && { venueId }),
          ...(Object.keys(dateFilter).length > 0 && { punchedAt: dateFilter }),
        },
      }),
    ])

    // Raggruppa per giorno per statistiche
    const byDay = new Map<
      string,
      { date: string; punches: typeof punches; stats: Record<string, unknown> }
    >()

    for (const punch of punches) {
      const dateKey = punch.punchedAt.toISOString().split('T')[0]
      if (!byDay.has(dateKey)) {
        byDay.set(dateKey, {
          date: dateKey,
          punches: [],
          stats: {},
        })
      }
      byDay.get(dateKey)!.punches.push(punch)
    }

    // Calcola statistiche per giorno
    const dailySummaries = Array.from(byDay.values()).map((day) => {
      const sortedPunches = day.punches.sort(
        (a, b) => a.punchedAt.getTime() - b.punchedAt.getTime()
      )

      const clockIn = sortedPunches.find((p) => p.punchType === 'IN')
      const clockOut = sortedPunches.filter((p) => p.punchType === 'OUT').pop()

      let minutesWorked = 0
      if (clockIn && clockOut) {
        minutesWorked = Math.round(
          (clockOut.punchedAt.getTime() - clockIn.punchedAt.getTime()) /
            (1000 * 60)
        )
      }

      return {
        date: day.date,
        clockIn: clockIn?.punchedAt ?? null,
        clockOut: clockOut?.punchedAt ?? null,
        minutesWorked,
        hoursWorked: Math.round((minutesWorked / 60) * 100) / 100,
        punchCount: day.punches.length,
        venues: [...new Set(day.punches.map((p) => p.venue.code))],
        hasAnomaly: day.punches.some((p) => !p.isWithinRadius),
      }
    })

    return NextResponse.json({
      data: punches.map((punch) => ({
        id: punch.id,
        type: punch.punchType,
        method: punch.punchMethod,
        time: punch.punchedAt,
        venue: punch.venue,
        assignment: punch.assignment,
        isWithinRadius: punch.isWithinRadius,
        distanceFromVenue: punch.distanceFromVenue
          ? Number(punch.distanceFromVenue)
          : null,
        notes: punch.notes,
        isManual: punch.isManual,
      })),
      dailySummaries,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/attendance/history', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello storico timbrature' },
      { status: 500 }
    )
  }
}
