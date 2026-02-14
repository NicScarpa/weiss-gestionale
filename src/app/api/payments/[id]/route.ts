import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PaymentStatus } from '@prisma/client'

// GET /api/payments/[id] - Dettaglio pagamento
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        venue: { select: { id: true, name: true, code: true } },
        journalEntry: {
          include: {
            account: { select: { id: true, code: true, name: true } },
            budgetCategory: { select: { id: true, code: true, name: true, color: true } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Verifica permessi venue
    const userVenues = session.user.venues || []
    if (!userVenues.includes(payment.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error fetching payment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/payments/[id] - Aggiorna pagamento
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Verifica esistenza e permessi
    const existing = await prisma.payment.findUnique({
      where: { id },
      select: { venueId: true, stato: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const userVenues = session.user.venues || []
    if (!userVenues.includes(existing.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Campi aggiornabili
    const updatable = [
      'tipo', 'dataEsecuzione', 'importo', 'beneficiarioNome',
      'beneficiarioIban', 'causale', 'riferimentoInterno', 'note',
    ]
    const data: any = {}
    for (const field of updatable) {
      if (body[field] !== undefined) {
        data[field] = field === 'dataEsecuzione' ? new Date(body[field]) : body[field]
      }
    }

    const payment = await prisma.payment.update({
      where: { id },
      data,
      include: {
        venue: { select: { id: true, name: true, code: true } },
        journalEntry: { select: { id: true, description: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error updating payment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/payments/[id] - Elimina pagamento
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Verifica esistenza e permessi
    const existing = await prisma.payment.findUnique({
      where: { id },
      select: { venueId: true, stato: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Non permettere eliminazione se già disposto
    if (existing.stato === PaymentStatus.DISPOSTO || existing.stato === PaymentStatus.COMPLETATO) {
      return NextResponse.json(
        { error: 'Non è possibile eliminare un pagamento già processato' },
        { status: 400 }
      )
    }

    const userVenues = session.user.venues || []
    if (!userVenues.includes(existing.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.payment.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
