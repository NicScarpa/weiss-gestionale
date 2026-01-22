import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/products/[id]/price-history - Storico prezzi completo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)

    const supplierId = searchParams.get('supplierId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Verifica esistenza prodotto
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true },
    })

    if (!product) {
      return NextResponse.json({ error: 'Prodotto non trovato' }, { status: 404 })
    }

    // Costruisci filtro
    const where: Record<string, unknown> = {
      productId: id,
    }

    if (supplierId) {
      where.supplierId = supplierId
    }

    if (fromDate || toDate) {
      where.invoiceDate = {}
      if (fromDate) {
        (where.invoiceDate as Record<string, unknown>).gte = new Date(fromDate)
      }
      if (toDate) {
        (where.invoiceDate as Record<string, unknown>).lte = new Date(toDate)
      }
    }

    const total = await prisma.priceHistory.count({ where })

    const history = await prisma.priceHistory.findMany({
      where,
      include: {
        supplier: {
          select: { id: true, name: true },
        },
      },
      orderBy: { invoiceDate: 'desc' },
      skip: offset,
      take: limit,
    })

    // Calcola trend prezzi (ultimi 6 mesi per grafico)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const trendData = await prisma.priceHistory.findMany({
      where: {
        productId: id,
        invoiceDate: { gte: sixMonthsAgo },
      },
      select: {
        price: true,
        invoiceDate: true,
        supplierId: true,
      },
      orderBy: { invoiceDate: 'asc' },
    })

    // Raggruppa per mese per trend
    const monthlyTrend = trendData.reduce(
      (acc, item) => {
        const month = item.invoiceDate.toISOString().slice(0, 7) // YYYY-MM
        if (!acc[month]) {
          acc[month] = { prices: [], count: 0 }
        }
        acc[month].prices.push(Number(item.price))
        acc[month].count++
        return acc
      },
      {} as Record<string, { prices: number[]; count: number }>
    )

    const trend = Object.entries(monthlyTrend).map(([month, data]) => ({
      month,
      avgPrice: data.prices.reduce((a, b) => a + b, 0) / data.prices.length,
      minPrice: Math.min(...data.prices),
      maxPrice: Math.max(...data.prices),
      count: data.count,
    }))

    return NextResponse.json({
      data: {
        product,
        history,
        trend,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/products/[id]/price-history', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello storico prezzi' },
      { status: 500 }
    )
  }
}
