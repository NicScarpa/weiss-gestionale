import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { AlertStatus, CashFlowAlertStatus, CashFlowAlertType, Prisma } from '@prisma/client'

// PATCH /api/cashflow/alerts/bulk - Aggiorna stato alert in blocco
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { alertIds, action } = body

    if (!alertIds?.length || !action) {
      return NextResponse.json(
        { error: 'alertIds e action sono richiesti' },
        { status: 400 }
      )
    }

    // Verifica permessi sul primo alert
    const firstAlert = await prisma.cashFlowAlert.findFirst({
      where: { id: alertIds[0] },
      select: { venueId: true },
    })

    if (!firstAlert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    const venueId = await getVenueId()
    if (firstAlert.venueId !== venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const newStatus = action === 'resolve' ? 'RISOLTO' : 'IGNORATO'

    await prisma.cashFlowAlert.updateMany({
      where: { id: { in: alertIds } },
      data: { stato: newStatus },
    })

    return NextResponse.json({ success: true, updated: alertIds.length })
  } catch (error) {
    console.error('Error bulk updating cash flow alerts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/cashflow/alerts - Lista alert cash flow
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const stato = searchParams.get('stato')
    const tipo = searchParams.get('tipo')
    const forecastId = searchParams.get('forecastId')

    const venueId = await getVenueId()

    const where: Prisma.CashFlowAlertWhereInput = { venueId }
    if (stato) where.stato = stato as CashFlowAlertStatus
    if (tipo) where.tipo = tipo as CashFlowAlertType
    if (forecastId) where.forecastId = forecastId

    const alerts = await prisma.cashFlowAlert.findMany({
      where,
      include: {
        venue: { select: { id: true, name: true, code: true } },
        forecast: { select: { id: true, nome: true } },
      },
      orderBy: { dataPrevista: 'asc' },
    })

    return NextResponse.json({ data: alerts })
  } catch (error) {
    console.error('Error fetching cash flow alerts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
