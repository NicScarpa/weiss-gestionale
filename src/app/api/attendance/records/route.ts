import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/attendance/records - Lista timbrature (manager)
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
    const date = searchParams.get('date')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const userId = searchParams.get('userId')
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 100
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!)
      : 0

    // Costruisci filtri
    const where: Record<string, unknown> = {}

    if (venueId) where.venueId = venueId
    if (userId) where.userId = userId

    // Filtro date
    if (date) {
      const targetDate = new Date(date)
      targetDate.setHours(0, 0, 0, 0)
      const nextDay = new Date(targetDate)
      nextDay.setDate(nextDay.getDate() + 1)

      where.punchedAt = {
        gte: targetDate,
        lt: nextDay,
      }
    } else if (from || to) {
      where.punchedAt = {}
      if (from) (where.punchedAt as Record<string, unknown>).gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        ;(where.punchedAt as Record<string, unknown>).lte = toDate
      }
    }

    // Se non admin, filtra per sede
    if (user.role.name !== 'admin' && user.venueId) {
      where.venueId = user.venueId
    }

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        orderBy: { punchedAt: 'desc' },
        take: limit,
        skip: offset,
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
      prisma.attendanceRecord.count({ where }),
    ])

    return NextResponse.json({
      data: records.map((r) => ({
        id: r.id,
        user: r.user,
        venue: r.venue,
        punchType: r.punchType,
        punchMethod: r.punchMethod,
        punchedAt: r.punchedAt,
        latitude: r.latitude ? Number(r.latitude) : null,
        longitude: r.longitude ? Number(r.longitude) : null,
        accuracy: r.accuracy ? Number(r.accuracy) : null,
        distanceFromVenue: r.distanceFromVenue
          ? Number(r.distanceFromVenue)
          : null,
        isWithinRadius: r.isWithinRadius,
        isManual: r.isManual,
        manualEntryBy: r.manualEntryBy,
        manualEntryReason: r.manualEntryReason,
        notes: r.notes,
        assignment: r.assignment,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error('Errore GET /api/attendance/records:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle timbrature' },
      { status: 500 }
    )
  }
}
