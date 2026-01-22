import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// GET /api/products/[id] - Dettaglio prodotto con storico prezzi
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

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
        priceHistory: {
          orderBy: { invoiceDate: 'desc' },
          take: 50, // Ultime 50 variazioni
          include: {
            supplier: {
              select: { id: true, name: true },
            },
          },
        },
        priceAlerts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            supplier: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Prodotto non trovato' }, { status: 404 })
    }

    // Calcola statistiche sui prezzi
    const priceStats = await prisma.priceHistory.aggregate({
      where: { productId: id },
      _avg: { price: true },
      _min: { price: true },
      _max: { price: true },
      _count: true,
    })

    // Calcola prezzo medio per fornitore
    const priceBySupplier = await prisma.priceHistory.groupBy({
      by: ['supplierId'],
      where: { productId: id, supplierId: { not: null } },
      _avg: { price: true },
      _count: true,
    })

    // Recupera nomi fornitori
    const supplierIds = priceBySupplier
      .filter((s) => s.supplierId)
      .map((s) => s.supplierId as string)
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    })

    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]))

    return NextResponse.json({
      data: {
        ...product,
        stats: {
          avgPrice: priceStats._avg.price,
          minPrice: priceStats._min.price,
          maxPrice: priceStats._max.price,
          recordCount: priceStats._count,
        },
        priceBySupplier: priceBySupplier.map((s) => ({
          supplierId: s.supplierId,
          supplierName: supplierMap.get(s.supplierId!) || 'Sconosciuto',
          avgPrice: s._avg.price,
          purchaseCount: s._count,
        })),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/products/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del prodotto' },
      { status: 500 }
    )
  }
}

// PATCH /api/products/[id] - Aggiorna prodotto
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const data = updateProductSchema.parse(body)

    // Verifica esistenza
    const existing = await prisma.product.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Prodotto non trovato' }, { status: 404 })
    }

    // Se cambio nome, verifica unicità
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.product.findFirst({
        where: {
          venueId: existing.venueId,
          name: { equals: data.name, mode: 'insensitive' },
          id: { not: id },
        },
      })

      if (duplicate) {
        return NextResponse.json(
          { error: 'Esiste già un prodotto con questo nome' },
          { status: 409 }
        )
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data,
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PATCH /api/products/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del prodotto' },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - Disattiva prodotto (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Solo admin può eliminare prodotti' }, { status: 403 })
    }

    const { id } = await params

    const existing = await prisma.product.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Prodotto non trovato' }, { status: 404 })
    }

    // Soft delete
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Prodotto disattivato' })
  } catch (error) {
    logger.error('Errore DELETE /api/products/[id]', error)
    return NextResponse.json(
      { error: 'Errore nella disattivazione del prodotto' },
      { status: 500 }
    )
  }
}
