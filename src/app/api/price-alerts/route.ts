import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { prisma } from '@/lib/prisma'
import { PriceAlertStatus } from '@prisma/client'

import { logger } from '@/lib/logger'
// GET /api/price-alerts - Lista alert prezzi
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as PriceAlertStatus | null
    const alertType = searchParams.get('alertType')
    const venueId = searchParams.get('venueId') || await getVenueId()
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Costruisci filtro
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (alertType) {
      where.alertType = alertType
    }

    if (venueId) {
      where.product = {
        venueId,
      }
    }

    const total = await prisma.priceAlert.count({ where })

    const alerts = await prisma.priceAlert.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            unit: true,
            venue: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    })

    // Statistiche per dashboard
    const stats = await prisma.priceAlert.groupBy({
      by: ['status'],
      where: venueId ? { product: { venueId } } : undefined,
      _count: true,
    })

    const statsMap = stats.reduce(
      (acc, s) => {
        acc[s.status] = s._count
        return acc
      },
      {} as Record<string, number>
    )

    return NextResponse.json({
      data: alerts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      stats: {
        pending: statsMap['PENDING'] || 0,
        acknowledged: statsMap['ACKNOWLEDGED'] || 0,
        approved: statsMap['APPROVED'] || 0,
        disputed: statsMap['DISPUTED'] || 0,
        total,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/price-alerts', error)
    return NextResponse.json(
      { error: 'Errore nel recupero degli alert prezzi' },
      { status: 500 }
    )
  }
}
