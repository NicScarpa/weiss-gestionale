import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/pagamenti/[id]
 * Recupera un pagamento specifico
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const payment = await prisma.payment.findUnique({
      where: { id: id },
      include: {
        venue: {
          select: { id: true, name: true },
        },
        journalEntry: {
          select: { id: true, date: true, description: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Errore GET /api/pagamenti/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del pagamento' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/pagamenti/[id]
 * Aggiorna un pagamento
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const current = await prisma.payment.findUnique({
      where: { id: id },
      select: { id: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    const body = await request.json()

    const updated = await prisma.payment.update({
      where: { id: id },
      data: {
        ...body,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Errore PATCH /api/pagamenti/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del pagamento' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/pagamenti/[id]
 * Elimina un pagamento
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const current = await prisma.payment.findUnique({
      where: { id: id },
      select: { stato: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    // Permetti eliminazione solo in BOZZA
    if (current.stato !== 'BOZZA') {
      return NextResponse.json(
        { error: 'Possibile eliminare solo pagamenti in stato BOZZA' },
        { status: 400 }
      )
    }

    await prisma.payment.delete({
      where: { id: id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Errore DELETE /api/pagamenti/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del pagamento' },
      { status: 500 }
    )
  }
}
