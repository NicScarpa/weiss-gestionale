import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AlertStatus } from '@prisma/client'

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

    const userVenues = session.user.venues || []
    if (!userVenues.includes(firstAlert.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const newStatus = action === 'resolve' ? AlertStatus.RISOLTO : AlertStatus.IGNORATO

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
    const venueId = searchParams.get('venueId')
    const stato = searchParams.get('stato')
    const tipo = searchParams.get('tipo')
    const forecastId = searchParams.get('forecastId')

    // Filtro per venue
    const userVenues = session.user.venues || []
    const filterVenueId = venueId || userVenues[0]

    if (!filterVenueId) {
      return NextResponse.json({ error: 'Venue ID richiesto' }, { status: 400 })
    }

    const where: any = { venueId: filterVenueId }
    if (stato) where.stato = stato
    if (tipo) where.tipo = tipo
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
