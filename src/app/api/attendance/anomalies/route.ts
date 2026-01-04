import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/attendance/anomalies - Lista anomalie
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

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

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const userId = searchParams.get('userId')
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 50
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!)
      : 0

    // Costruisci filtri
    const where: Record<string, unknown> = {}

    if (venueId) where.venueId = venueId
    if (userId) where.userId = userId
    if (status) where.status = status

    if (from || to) {
      where.date = {}
      if (from) (where.date as Record<string, unknown>).gte = new Date(from)
      if (to) (where.date as Record<string, unknown>).lte = new Date(to)
    }

    // Se non admin, filtra per sede dell'utente
    if (user.role.name !== 'admin' && user.venueId) {
      where.venueId = user.venueId
    }

    const [anomalies, total] = await Promise.all([
      prisma.attendanceAnomaly.findMany({
        where,
        orderBy: [{ status: 'asc' }, { date: 'desc' }],
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
          record: {
            select: {
              id: true,
              punchType: true,
              punchedAt: true,
              distanceFromVenue: true,
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
                },
              },
            },
          },
        },
      }),
      prisma.attendanceAnomaly.count({ where }),
    ])

    // Statistiche
    const stats = await prisma.attendanceAnomaly.groupBy({
      by: ['status'],
      where: {
        ...(venueId && { venueId }),
        ...(user.role.name !== 'admin' && user.venueId && { venueId: user.venueId }),
      },
      _count: { id: true },
    })

    const statusCounts = Object.fromEntries(
      stats.map((s) => [s.status, s._count.id])
    )

    return NextResponse.json({
      data: anomalies,
      stats: {
        pending: statusCounts['PENDING'] ?? 0,
        approved: statusCounts['APPROVED'] ?? 0,
        rejected: statusCounts['REJECTED'] ?? 0,
        autoFixed: statusCounts['AUTO_FIXED'] ?? 0,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error('Errore GET /api/attendance/anomalies:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle anomalie' },
      { status: 500 }
    )
  }
}
