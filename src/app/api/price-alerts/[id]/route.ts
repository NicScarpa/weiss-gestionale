import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// GET /api/price-alerts/[id] - Dettaglio alert
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

    const alert = await prisma.priceAlert.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            unit: true,
            lastPrice: true,
            priceHistory: {
              orderBy: { invoiceDate: 'desc' },
              take: 10,
              include: {
                supplier: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        supplier: true,
      },
    })

    if (!alert) {
      return NextResponse.json({ error: 'Alert non trovato' }, { status: 404 })
    }

    return NextResponse.json({ data: alert })
  } catch (error) {
    console.error('Errore GET /api/price-alerts/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dell\'alert' },
      { status: 500 }
    )
  }
}

// PATCH /api/price-alerts/[id] - Aggiorna stato alert
const updateAlertSchema = z.object({
  status: z.enum(['PENDING', 'ACKNOWLEDGED', 'APPROVED', 'DISPUTED']),
  notes: z.string().optional().nullable(),
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
    const data = updateAlertSchema.parse(body)

    const existing = await prisma.priceAlert.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Alert non trovato' }, { status: 404 })
    }

    const updated = await prisma.priceAlert.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        reviewedAt: new Date(),
        reviewedBy: session.user.id,
      },
      include: {
        product: {
          select: { id: true, name: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PATCH /api/price-alerts/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento dell\'alert' },
      { status: 500 }
    )
  }
}
