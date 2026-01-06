import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/portal/shifts - Turni personali dipendente
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : undefined

    const whereClause: Record<string, unknown> = {
      userId: session.user.id,
    }

    // Filtro date
    if (from || to) {
      whereClause.date = {}
      if (from) {
        (whereClause.date as Record<string, unknown>).gte = new Date(from)
      }
      if (to) {
        (whereClause.date as Record<string, unknown>).lte = new Date(to)
      }
    }

    // Solo turni da schedule pubblicati
    whereClause.schedule = {
      status: 'PUBLISHED',
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: whereClause,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
        status: true,
        swapStatus: true,
        swapRequestedById: true,
        swapWithUserId: true,
        notes: true,
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
          },
        },
        schedule: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { startTime: 'asc' },
      ],
      ...(limit && { take: limit }),
    })

    return NextResponse.json({ data: assignments })
  } catch (error) {
    console.error('Errore GET /api/portal/shifts:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei turni' },
      { status: 500 }
    )
  }
}
