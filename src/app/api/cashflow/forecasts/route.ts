import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ForecastStatus, ForecastType } from '@prisma/client'
import { addDays, startOfDay, endOfDay } from 'date-fns'

// GET /api/cashflow/forecasts - Lista cash flow forecasts
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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Filtro per venue
    const userVenues = session.user.venues || []
    const filterVenueId = venueId || userVenues[0]

    if (!filterVenueId) {
      return NextResponse.json({ error: 'Venue ID richiesto' }, { status: 400 })
    }

    const where: any = { venueId: filterVenueId }
    if (stato) where.stato = stato
    if (tipo) where.tipo = tipo

    const [forecasts, total] = await Promise.all([
      prisma.cashFlowForecast.findMany({
        where,
        include: {
          venue: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { lines: true, alerts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cashFlowForecast.count({ where }),
    ])

    return NextResponse.json({
      data: forecasts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Error fetching cash flow forecasts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/cashflow/forecasts - Crea nuovo forecast
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      venueId,
      nome,
      descrizione,
      dataInizio,
      dataFine,
      saldoIniziale,
      tipo,
    } = body

    if (!venueId || !nome || !dataInizio || !dataFine) {
      return NextResponse.json(
        { error: 'Campi obbligatori mancanti' },
        { status: 400 }
      )
    }

    // Crea forecast con righe generate
    const forecast = await prisma.cashFlowForecast.create({
      data: {
        venueId,
        createdById: session.user.id,
        nome,
        descrizione,
        dataInizio: new Date(dataInizio),
        dataFine: new Date(dataFine),
        saldoIniziale: saldoIniziale || 0,
        saldoFinale: 0,
        totaleEntrate: 0,
        totaleUscite: 0,
        stato: ForecastStatus.BOZZA,
        tipo: tipo || ForecastType.BASE,
      },
      include: {
        venue: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Genera righe vuote per ogni giorno
    const daysDiff = Math.ceil(
      (new Date(dataFine).getTime() - new Date(dataInizio).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1

    const lines = []
    for (let i = 0; i < daysDiff; i++) {
      const date = addDays(new Date(dataInizio), i)
      lines.push({
        forecastId: forecast.id,
        data: startOfDay(date),
        tipo: 'USCITA',
        importo: 0,
        confidenza: 'MEDIA',
      })
    }

    if (lines.length > 0) {
      await prisma.cashFlowForecastLine.createMany({
        data: lines,
      })
    }

    return NextResponse.json(forecast, { status: 201 })
  } catch (error) {
    console.error('Error creating cash flow forecast:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
