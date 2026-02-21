import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

// GET /api/cashflow/forecasts/[id]/lines - Lista righe forecast
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

    // Verifica esistenza e permessi
    const forecast = await prisma.cashFlowForecast.findUnique({
      where: { id },
      select: { id: true, venueId: true },
    })

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const venueId = await getVenueId()
    if (forecast.venueId !== venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const lines = await prisma.cashFlowForecastLine.findMany({
      where: { forecastId: id },
      orderBy: { data: 'asc' },
    })

    // Calcola saldo progressivo
    let saldoProgressivo = 0
    const linesWithBalance = lines.map(line => {
      const importo = line.importo.toNumber()
      if (line.tipo === 'ENTRATA') {
        saldoProgressivo += importo
      } else {
        saldoProgressivo -= importo
      }
      return {
        ...line,
        saldoProgressivo,
      }
    })

    return NextResponse.json({ data: linesWithBalance })
  } catch (error) {
    console.error('Error fetching forecast lines:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/cashflow/forecasts/[id]/lines - Aggiungi riga
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
    const {
      data,
      tipo,
      importo,
      categoria,
      descrizione,
      fonte,
      confidenza,
    } = body

    // Verifica esistenza e permessi
    const forecast = await prisma.cashFlowForecast.findUnique({
      where: { id },
      select: { id: true, venueId: true },
    })

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const venueId = await getVenueId()
    if (forecast.venueId !== venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!data || !tipo || importo === undefined) {
      return NextResponse.json(
        { error: 'Campi obbligatori mancanti' },
        { status: 400 }
      )
    }

    const line = await prisma.cashFlowForecastLine.create({
      data: {
        forecastId: id,
        data: new Date(data),
        tipo,
        importo: parseFloat(importo),
        categoria,
        descrizione,
        fonte,
        confidenza: confidenza || 'MEDIA',
      },
    })

    return NextResponse.json(line, { status: 201 })
  } catch (error) {
    console.error('Error creating forecast line:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
