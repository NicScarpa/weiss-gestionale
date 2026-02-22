import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Helper: get ISO week number from a Date
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Helper: get all business days in a date range (Mon-Sat by default, excludes Sunday)
 */
function getBusinessDaysInRange(start: Date, end: Date): number {
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0) count++ // exclude Sunday
    current.setDate(current.getDate() + 1)
  }
  return count
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Require admin or manager role
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Parse month query param (defaults to current month)
    const searchParams = request.nextUrl.searchParams
    const monthParam = searchParams.get('month')

    let year: number
    let month: number

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number)
      year = y
      month = m
    } else {
      const now = new Date()
      year = now.getFullYear()
      month = now.getMonth() + 1
    }

    const periodStart = new Date(year, month - 1, 1)
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999)

    // Verify the staff member exists
    const staffExists = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!staffExists) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    // Fetch attendance records for the period
    const records = await prisma.attendanceRecord.findMany({
      where: {
        userId: id,
        punchedAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { punchedAt: 'asc' },
      select: {
        punchType: true,
        punchedAt: true,
      },
    })

    // Fetch anomalies for the period
    const anomalies = await prisma.attendanceAnomaly.findMany({
      where: {
        userId: id,
        date: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        anomalyType: true,
        date: true,
        differenceMinutes: true,
      },
    })

    // Calculate hours from IN/OUT pairs
    let totalMinutes = 0
    const workedDates = new Set<string>()
    const weeklyMinutes = new Map<number, number>()

    // Group records by date for pairing
    const recordsByDate = new Map<string, typeof records>()
    for (const record of records) {
      const dateKey = record.punchedAt.toISOString().split('T')[0]
      if (!recordsByDate.has(dateKey)) {
        recordsByDate.set(dateKey, [])
      }
      recordsByDate.get(dateKey)!.push(record)
    }

    // Process each date's records
    for (const [dateKey, dayRecords] of recordsByDate) {
      workedDates.add(dateKey)
      const isoWeek = getISOWeek(new Date(dateKey))

      // Pair IN/OUT punches
      let currentIn: Date | null = null
      for (const record of dayRecords) {
        if (record.punchType === 'IN') {
          currentIn = record.punchedAt
        } else if (record.punchType === 'OUT' && currentIn) {
          const diffMinutes = (record.punchedAt.getTime() - currentIn.getTime()) / 60000
          totalMinutes += diffMinutes

          // Add to weekly breakdown
          const existing = weeklyMinutes.get(isoWeek) || 0
          weeklyMinutes.set(isoWeek, existing + diffMinutes)

          currentIn = null
        }
        // BREAK_START/BREAK_END are ignored for total hours calculation
      }
    }

    const totalHours = Math.round((totalMinutes / 60) * 100) / 100
    const daysWorked = workedDates.size
    const avgHoursPerDay = daysWorked > 0
      ? Math.round((totalHours / daysWorked) * 100) / 100
      : 0

    // Count anomalies by type
    const lateArrivals = anomalies.filter(a => a.anomalyType === 'LATE_CLOCK_IN').length
    const overtimeCount = anomalies.filter(a => a.anomalyType === 'OVERTIME').length

    // Calculate overtime hours from anomaly differenceMinutes
    const overtimeMinutes = anomalies
      .filter(a => a.anomalyType === 'OVERTIME')
      .reduce((sum, a) => sum + (a.differenceMinutes || 0), 0)
    const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100

    // Calculate absences: business days in period without any punch
    const businessDays = getBusinessDaysInRange(periodStart, periodEnd)
    const absences = Math.max(0, businessDays - daysWorked)

    // Build weekly breakdown sorted by week number
    const weeklyBreakdown = Array.from(weeklyMinutes.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, minutes]) => ({
        week,
        hours: Math.round((minutes / 60) * 100) / 100,
      }))

    return NextResponse.json({
      staffId: id,
      period: `${year}-${String(month).padStart(2, '0')}`,
      kpi: {
        totalHours,
        avgHoursPerDay,
        daysWorked,
        lateArrivals,
        absences,
        overtimeHours,
        overtimeCount,
      },
      weeklyBreakdown,
    })
  } catch (error) {
    logger.error('Errore GET /api/staff/[id]/statistics', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo delle statistiche' },
      { status: 500 }
    )
  }
}
