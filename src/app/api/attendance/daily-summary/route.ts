import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/attendance/daily-summary - Riepilogo giornaliero presenze
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

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

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const dateParam = searchParams.get('date')

    // Data default: oggi
    const targetDate = dateParam ? new Date(dateParam) : new Date()
    targetDate.setHours(0, 0, 0, 0)
    const nextDay = new Date(targetDate)
    nextDay.setDate(nextDay.getDate() + 1)

    // Filtra per sede
    const venueFilter: Record<string, unknown> = {}
    if (venueId) {
      venueFilter.venueId = venueId
    } else if (user.role.name !== 'admin' && user.venueId) {
      venueFilter.venueId = user.venueId
    }

    // Recupera tutti i turni schedulati per oggi
    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        date: {
          gte: targetDate,
          lt: nextDay,
        },
        ...venueFilter,
        schedule: {
          status: 'PUBLISHED',
        },
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
        shiftDefinition: {
          select: {
            name: true,
            code: true,
            color: true,
          },
        },
        attendanceRecords: {
          where: {
            punchedAt: {
              gte: targetDate,
              lt: nextDay,
            },
          },
          orderBy: { punchedAt: 'asc' },
        },
      },
    })

    // Formatta il riepilogo
    const summary = assignments.map((assignment) => {
      const records = assignment.attendanceRecords
      const clockIn = records.find((r) => r.punchType === 'IN')
      const clockOut = records.filter((r) => r.punchType === 'OUT').pop()
      const breakStart = records.filter((r) => r.punchType === 'BREAK_START').pop()
      const breakEnd = records.filter((r) => r.punchType === 'BREAK_END').pop()

      // Determina lo stato
      let status: 'SCHEDULED' | 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' | 'ABSENT'

      if (clockOut) {
        status = 'CLOCKED_OUT'
      } else if (breakStart && !breakEnd) {
        status = 'ON_BREAK'
      } else if (clockIn) {
        status = 'CLOCKED_IN'
      } else {
        // Verifica se il turno è già passato
        const now = new Date()
        const scheduledEnd = new Date(assignment.endTime)
        scheduledEnd.setFullYear(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate()
        )

        if (now > scheduledEnd) {
          status = 'ABSENT'
        } else {
          status = 'SCHEDULED'
        }
      }

      // Calcola ore lavorate
      let minutesWorked = 0
      if (clockIn) {
        const endTime = clockOut?.punchedAt ?? new Date()
        minutesWorked = Math.round(
          (endTime.getTime() - clockIn.punchedAt.getTime()) / (1000 * 60)
        )
      }

      // Calcola ore schedulate
      const scheduledStart = new Date(assignment.startTime)
      const scheduledEnd = new Date(assignment.endTime)
      let scheduledMinutes = Math.round(
        (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60)
      )
      // Gestisci turni che attraversano la mezzanotte
      if (scheduledMinutes < 0) scheduledMinutes += 24 * 60
      scheduledMinutes -= assignment.breakMinutes

      return {
        assignment: {
          id: assignment.id,
          user: assignment.user,
          venue: assignment.venue,
          shiftDefinition: assignment.shiftDefinition,
          scheduledStart: assignment.startTime,
          scheduledEnd: assignment.endTime,
          scheduledMinutes,
        },
        attendance: {
          status,
          clockIn: clockIn?.punchedAt ?? null,
          clockOut: clockOut?.punchedAt ?? null,
          breakStart: breakStart?.punchedAt ?? null,
          breakEnd: breakEnd?.punchedAt ?? null,
          minutesWorked,
          hoursWorked: Math.round((minutesWorked / 60) * 100) / 100,
          punchCount: records.length,
        },
        hasAnomalies: records.some((r) => !r.isWithinRadius),
        actualVsScheduled: {
          differenceMinutes: minutesWorked - scheduledMinutes,
          percentageWorked:
            scheduledMinutes > 0
              ? Math.round((minutesWorked / scheduledMinutes) * 100)
              : 0,
        },
      }
    })

    // Statistiche aggregate
    const stats = {
      totalScheduled: summary.length,
      clockedIn: summary.filter((s) => s.attendance.status === 'CLOCKED_IN').length,
      onBreak: summary.filter((s) => s.attendance.status === 'ON_BREAK').length,
      clockedOut: summary.filter((s) => s.attendance.status === 'CLOCKED_OUT').length,
      absent: summary.filter((s) => s.attendance.status === 'ABSENT').length,
      notYetStarted: summary.filter((s) => s.attendance.status === 'SCHEDULED').length,
      withAnomalies: summary.filter((s) => s.hasAnomalies).length,
      totalScheduledHours: Math.round(
        summary.reduce((acc, s) => acc + s.assignment.scheduledMinutes, 0) / 60
      ),
      totalWorkedHours: Math.round(
        summary.reduce((acc, s) => acc + s.attendance.minutesWorked, 0) / 60 * 100
      ) / 100,
    }

    return NextResponse.json({
      date: targetDate.toISOString().split('T')[0],
      data: summary,
      stats,
    })
  } catch (error) {
    console.error('Errore GET /api/attendance/daily-summary:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del riepilogo' },
      { status: 500 }
    )
  }
}
