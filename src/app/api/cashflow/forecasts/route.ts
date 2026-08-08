import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { liquiditaAlGiorno } from '@/lib/saldi'
import { ForecastStatus, ForecastType, Prisma } from '@prisma/client'

// GET /api/cashflow/forecasts - Lista cash flow forecasts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const stato = searchParams.get('stato')
    const tipo = searchParams.get('tipo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const venueId = await getVenueId()

    const where: Prisma.CashFlowForecastWhereInput = { venueId }
    if (stato) where.stato = stato as ForecastStatus
    if (tipo) where.tipo = tipo as ForecastType

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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const {
      nome,
      descrizione,
      dataInizio,
      dataFine,
      saldoIniziale,
      tipo,
    } = body

    // Override venueId from session, not from body (IDOR prevention)
    const venueId = await getVenueId()

    if (!venueId || !nome || !dataInizio || !dataFine) {
      return NextResponse.json(
        { error: 'Campi obbligatori mancanti' },
        { status: 400 }
      )
    }

    // Il punto di partenza è la liquidità di oggi, non zero: una previsione che
    // parte da una cifra mai esistita non si può confrontare con niente. È la
    // stessa fonte della card "Saldo Attuale" (`@/lib/saldi`), così le due
    // schermate non possono discordare.
    const partenza =
      saldoIniziale === undefined || saldoIniziale === null || saldoIniziale === ''
        ? await liquiditaAlGiorno(venueId)
        : saldoIniziale

    // La previsione nasce vuota. Prima si generava una riga per ogni giorno del
    // periodo, tutte a zero euro e tutte di tipo USCITA: righe che nessuno
    // aveva chiesto, che rendevano illeggibile l'elenco e che bloccavano
    // l'eliminazione della previsione stessa (`onDelete: Restrict`).
    const forecast = await prisma.cashFlowForecast.create({
      data: {
        venueId,
        createdById: session.user.id,
        nome,
        descrizione,
        dataInizio: new Date(dataInizio),
        dataFine: new Date(dataFine),
        saldoIniziale: partenza,
        saldoFinale: partenza,
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

    return NextResponse.json(forecast, { status: 201 })
  } catch (error) {
    console.error('Error creating cash flow forecast:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
