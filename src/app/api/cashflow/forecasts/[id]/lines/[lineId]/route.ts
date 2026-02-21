import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// PATCH /api/cashflow/forecasts/[id]/lines/[lineId] - Aggiorna riga
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { lineId } = await params
    const body = await request.json()

    // Verifica esistenza e permessi
    const existing = await prisma.cashFlowForecastLine.findUnique({
      where: { id: lineId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 })
    }

    // Campi aggiornabili
    const updatable = [
      'data', 'tipo', 'importo', 'categoria', 'descrizione', 'fonte', 'confidenza', 'isRealizzata',
    ]
    const data: Prisma.CashFlowForecastLineUpdateInput = {}
    for (const field of updatable) {
      if (body[field] !== undefined) {
        data[field] = field === 'data' ? new Date(body[field]) : body[field]
      }
    }

    const line = await prisma.cashFlowForecastLine.update({
      where: { id: lineId },
      data,
    })

    return NextResponse.json(line)
  } catch (error) {
    console.error('Error updating forecast line:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/cashflow/forecasts/[id]/lines/[lineId] - Elimina riga
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { lineId } = await params

    await prisma.cashFlowForecastLine.delete({ where: { id: lineId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting forecast line:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
