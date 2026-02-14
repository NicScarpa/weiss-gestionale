import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PaymentStatus } from '@prisma/client'

// POST /api/payments/[id]/approve - Approva pagamento (da BOZZA → DA_APPROVARE → DISPOSTO)
export async function POST(
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
    const { nuovoStato } = body

    // Verifica esistenza e permessi
    const existing = await prisma.payment.findUnique({
      where: { id },
      include: { venue: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const userVenues = session.user.venues || []
    if (!userVenues.includes(existing.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validazione transizione stati
    const transitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.BOZZA]: [PaymentStatus.DA_APPROVARE],
      [PaymentStatus.DA_APPROVARE]: [PaymentStatus.DISPOSTO, PaymentStatus.BOZZA],
      [PaymentStatus.DISPOSTO]: [PaymentStatus.COMPLETATO],
      [PaymentStatus.COMPLETATO]: [],
      [PaymentStatus.ANNULLATO]: [PaymentStatus.BOZZA],
    }

    const allowedTransitions = transitions[existing.stato as PaymentStatus] || []
    if (nuovoStato && !allowedTransitions.includes(nuovoStato as PaymentStatus)) {
      return NextResponse.json(
        { error: `Transizione non valida da ${existing.stato} a ${nuovoStato}` },
        { status: 400 }
      )
    }

    // Auto-transizione se nuovo stato non specificato
    let targetStato = nuovoStato
    if (!targetStato) {
      if (existing.stato === PaymentStatus.BOZZA) {
        targetStato = PaymentStatus.DA_APPROVARE
      } else if (existing.stato === PaymentStatus.DA_APPROVARE) {
        targetStato = PaymentStatus.DISPOSTO
      } else if (existing.stato === PaymentStatus.DISPOSTO) {
        targetStato = PaymentStatus.COMPLETATO
      }
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: { stato: targetStato },
      include: {
        venue: { select: { id: true, name: true, code: true } },
        journalEntry: { select: { id: true, description: true } },
      },
    })

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error approving payment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
