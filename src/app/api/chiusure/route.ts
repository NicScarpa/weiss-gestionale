import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/chiusure - Lista chiusure con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Filtri
    const venueId = searchParams.get('venueId') || session.user.venueId
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Costruisci where clause
    const where: any = {}

    if (venueId) {
      where.venueId = venueId
    }

    if (status) {
      where.status = status
    }

    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) {
        where.date.gte = new Date(dateFrom)
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo)
      }
    }

    // Query con paginazione
    const [chiusure, total] = await Promise.all([
      prisma.dailyClosure.findMany({
        where,
        include: {
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          submittedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          validatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          stations: {
            select: {
              totalAmount: true,
            },
          },
          _count: {
            select: {
              stations: true,
              expenses: true,
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dailyClosure.count({ where }),
    ])

    // Formatta risposta
    const formattedChiusure = chiusure.map((c) => {
      // Calcola totale lordo sommando le stazioni
      const grossTotal = c.stations.reduce(
        (sum, s) => sum + Number(s.totalAmount || 0),
        0
      )

      return {
        id: c.id,
        date: c.date,
        status: c.status,
        venue: c.venue,
        grossTotal,
        isEvent: c.isEvent,
        eventName: c.eventName,
        submittedBy: c.submittedBy
          ? `${c.submittedBy.firstName} ${c.submittedBy.lastName}`
          : null,
        submittedAt: c.submittedAt,
        validatedBy: c.validatedBy
          ? `${c.validatedBy.firstName} ${c.validatedBy.lastName}`
          : null,
        validatedAt: c.validatedAt,
        createdAt: c.createdAt,
        stationsCount: c._count.stations,
        expensesCount: c._count.expenses,
      }
    })

    return NextResponse.json({
      data: formattedChiusure,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Errore GET /api/chiusure:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle chiusure' },
      { status: 500 }
    )
  }
}
