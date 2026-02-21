import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// GET /api/products - Lista prodotti con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const supplierId = searchParams.get('supplierId')
    const venueId = searchParams.get('venueId') || await getVenueId()
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sortBy') || 'name'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

    // Costruisci filtro
    const where: Record<string, unknown> = {
      isActive: true,
    }

    if (venueId) {
      where.venueId = venueId
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (category) {
      where.category = category
    }

    if (supplierId) {
      where.priceHistory = {
        some: { supplierId },
      }
    }

    // Conta totale per paginazione
    const total = await prisma.product.count({ where })

    // Ordina
    const orderBy: Record<string, string> = {}
    orderBy[sortBy] = sortOrder

    // Recupera prodotti con ultimo prezzo e statistiche
    const products = await prisma.product.findMany({
      where,
      include: {
        priceHistory: {
          orderBy: { invoiceDate: 'desc' },
          take: 1,
          include: {
            supplier: {
              select: { id: true, name: true },
            },
          },
        },
        priceAlerts: {
          where: { status: 'PENDING' },
          take: 1,
        },
        _count: {
          select: { priceHistory: true },
        },
      },
      orderBy,
      skip: offset,
      take: limit,
    })

    // Recupera categorie disponibili per filtro
    const categories = await prisma.product.groupBy({
      by: ['category'],
      where: {
        venueId,
        isActive: true,
        category: { not: null },
      },
      _count: true,
    })

    return NextResponse.json({
      data: products.map((p) => ({
        id: p.id,
        name: p.name,
        originalName: p.originalName,
        code: p.code,
        category: p.category,
        unit: p.unit,
        lastPrice: p.lastPrice,
        lastPriceDate: p.lastPriceDate,
        lastSupplier: p.priceHistory[0]?.supplier || null,
        priceHistoryCount: p._count.priceHistory,
        hasPendingAlert: p.priceAlerts.length > 0,
        lastPriceChange: p.priceHistory[0]
          ? {
              previousPrice: p.priceHistory[0].previousPrice,
              priceChange: p.priceHistory[0].priceChange,
              priceChangePct: p.priceHistory[0].priceChangePct,
            }
          : null,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      filters: {
        categories: categories.map((c) => ({
          name: c.category,
          count: c._count,
        })),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/products', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei prodotti' },
      { status: 500 }
    )
  }
}

// POST /api/products - Crea prodotto manualmente
const createProductSchema = z.object({
  name: z.string().min(1, 'Nome richiesto'),
  code: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().optional(),
  venueId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono creare prodotti
    if (!['admin', 'manager'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 })
    }

    const body = await request.json()
    const data = createProductSchema.parse(body)

    const venueId = data.venueId || await getVenueId()

    // Verifica unicità
    const existing = await prisma.product.findFirst({
      where: {
        venueId,
        name: { equals: data.name, mode: 'insensitive' },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Esiste già un prodotto con questo nome' },
        { status: 409 }
      )
    }

    const product = await prisma.product.create({
      data: {
        name: data.name,
        originalName: data.name,
        code: data.code,
        category: data.category,
        unit: data.unit,
        venueId,
      },
    })

    return NextResponse.json({ data: product }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/products', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del prodotto' },
      { status: 500 }
    )
  }
}
