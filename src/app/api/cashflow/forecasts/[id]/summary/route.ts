import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { Prisma } from '@prisma/client'

type Decimal = Prisma.Decimal

// GET /api/cashflow/forecasts/[id]/summary - Riepilogo forecast per dashboard
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

    const forecast = await prisma.cashFlowForecast.findUnique({
      where: { id },
      select: {
        id: true,
        venueId: true,
        nome: true,
        dataInizio: true,
        dataFine: true,
        saldoIniziale: true,
        lines: {
          select: {
            data: true,
            tipo: true,
            importo: true,
          },
          orderBy: { data: 'asc' },
        },
      },
    })

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const venueId = await getVenueId()
    if (forecast.venueId !== venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Calcola riepilogo
    const totaleEntrate = forecast.lines
      .filter(l => l.tipo === 'ENTRATA')
      .reduce((sum, l) => sum + l.importo.toNumber(), 0)

    const totaleUscite = forecast.lines
      .filter(l => l.tipo === 'USCITA')
      .reduce((sum, l) => sum + l.importo.toNumber(), 0)

    const saldoFinale = forecast.saldoIniziale.toNumber() + totaleEntrate - totaleUscite

    // Calcola saldo progressivo giornaliero per trovare il minimo
    let saldoCorrente = forecast.saldoIniziale.toNumber()
    let saldoMinimo = saldoCorrente
    let dataSaldoMinimo = forecast.dataInizio

    for (const line of forecast.lines) {
      if (line.tipo === 'ENTRATA') {
        saldoCorrente += line.importo.toNumber()
      } else {
        saldoCorrente -= line.importo.toNumber()
      }
      if (saldoCorrente < saldoMinimo) {
        saldoMinimo = saldoCorrente
        dataSaldoMinimo = line.data
      }
    }

    // Raggruppa per mese per grafico
    const monthlyData = groupByMonth(forecast.lines, forecast.dataInizio, forecast.saldoIniziale.toNumber())

    return NextResponse.json({
      forecast: {
        id: forecast.id,
        nome: forecast.nome,
        dataInizio: forecast.dataInizio,
        dataFine: forecast.dataFine,
      },
      summary: {
        saldoIniziale: forecast.saldoIniziale.toNumber(),
        totaleEntrate,
        totaleUscite,
        saldoFinale,
        saldoMinimo,
        dataSaldoMinimo,
        giorniTotali: forecast.lines.length,
        varianzaNetta: totaleEntrate - totaleUscite,
      },
      chartData: monthlyData,
    })
  } catch (error) {
    console.error('Error fetching forecast summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function groupByMonth(lines: { data: Date; tipo: string; importo: Decimal }[], startDate: Date, initialBalance: number) {
  const monthlyMap = new Map<string, { month: string; entrate: number; uscite: number; saldo: number }>()
  let saldo = initialBalance

  for (const line of lines) {
    const date = new Date(line.data)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        month: monthKey,
        entrate: 0,
        uscite: 0,
        saldo,
      })
    }

    const entry = monthlyMap.get(monthKey)!
    if (line.tipo === 'ENTRATA') {
      entry.entrate += line.importo.toNumber()
      saldo += line.importo.toNumber()
    } else {
      entry.uscite += line.importo.toNumber()
      saldo -= line.importo.toNumber()
    }
    entry.saldo = saldo
  }

  return Array.from(monthlyMap.values())
}
