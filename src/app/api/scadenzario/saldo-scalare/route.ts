import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { addDays, startOfDay, format } from 'date-fns'
import { getVenueId } from '@/lib/venue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function residuo(s: { importoTotale: any; importoPagato: any }) {
  return Number(s.importoTotale) - Number(s.importoPagato)
}

// GET /api/scadenzario/saldo-scalare - Calcola saldo scalare
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rangeGiorni = parseInt(searchParams.get('range') || '90')
    const includiScaduto = searchParams.get('includiScaduto') === 'true'

    const today = startOfDay(new Date())
    const endDate = addDays(today, rangeGiorni)

    const venueFilter = { venueId: await getVenueId() }

    const selectFields = {
      id: true,
      tipo: true,
      importoTotale: true,
      importoPagato: true,
      dataScadenza: true,
      isRicorrente: true,
      stato: true,
    } as const

    // Future schedules (within range, not cancelled)
    const schedulesInRange = await prisma.schedule.findMany({
      where: {
        ...venueFilter,
        stato: { not: 'annullata' },
        dataScadenza: { gte: today, lte: endDate },
      },
      select: selectFields,
      orderBy: { dataScadenza: 'asc' },
    })

    // Overdue schedules (before today, not paid/cancelled)
    const overdueSchedules = await prisma.schedule.findMany({
      where: {
        ...venueFilter,
        stato: { notIn: ['annullata', 'pagata'] },
        dataScadenza: { lt: today },
      },
      select: selectFields,
    })

    // Overdue totals
    const scadutoDaPagare = overdueSchedules
      .filter(s => s.tipo === 'passiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    const scadutoDaIncassare = overdueSchedules
      .filter(s => s.tipo === 'attiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    // Future totals
    const pagamentiTotale = schedulesInRange
      .filter(s => s.tipo === 'passiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    const pagamentiRicorrenti = schedulesInRange
      .filter(s => s.tipo === 'passiva' && s.isRicorrente)
      .reduce((sum, s) => sum + residuo(s), 0)

    const incassiTotale = schedulesInRange
      .filter(s => s.tipo === 'attiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    const incassiRicorrenti = schedulesInRange
      .filter(s => s.tipo === 'attiva' && s.isRicorrente)
      .reduce((sum, s) => sum + residuo(s), 0)

    // Saldo oggi: net position considering overdue + future
    const saldoOggi = incassiTotale + scadutoDaIncassare - pagamentiTotale - scadutoDaPagare

    // Group schedules by date for chart
    const schedulesByDate = new Map<string, typeof schedulesInRange>()
    for (const s of schedulesInRange) {
      const dateKey = format(new Date(s.dataScadenza), 'yyyy-MM-dd')
      if (!schedulesByDate.has(dateKey)) {
        schedulesByDate.set(dateKey, [])
      }
      schedulesByDate.get(dateKey)!.push(s)
    }

    // Build chart: start from saldoOggi, then apply daily changes
    const chartData: Array<{
      date: string
      saldo: number
      uscite: number
      entrate: number
      usciteRicorrenti: number
      entrateRicorrenti: number
    }> = []

    let balance = saldoOggi

    // Initial point (today)
    chartData.push({
      date: format(today, 'yyyy-MM-dd'),
      saldo: Math.round(balance * 100) / 100,
      uscite: 0,
      entrate: 0,
      usciteRicorrenti: 0,
      entrateRicorrenti: 0,
    })

    for (let d = 1; d <= rangeGiorni; d++) {
      const dayDate = addDays(today, d)
      const dateKey = format(dayDate, 'yyyy-MM-dd')
      const daySchedules = schedulesByDate.get(dateKey) || []

      const dayUscite = daySchedules
        .filter(s => s.tipo === 'passiva')
        .reduce((sum, s) => sum + residuo(s), 0)

      const dayEntrate = daySchedules
        .filter(s => s.tipo === 'attiva')
        .reduce((sum, s) => sum + residuo(s), 0)

      const dayUsciteRicorrenti = daySchedules
        .filter(s => s.tipo === 'passiva' && s.isRicorrente)
        .reduce((sum, s) => sum + residuo(s), 0)

      const dayEntrateRicorrenti = daySchedules
        .filter(s => s.tipo === 'attiva' && s.isRicorrente)
        .reduce((sum, s) => sum + residuo(s), 0)

      balance = balance + dayEntrate - dayUscite

      chartData.push({
        date: dateKey,
        saldo: Math.round(balance * 100) / 100,
        uscite: Math.round(dayUscite * 100) / 100,
        entrate: Math.round(dayEntrate * 100) / 100,
        usciteRicorrenti: Math.round(dayUsciteRicorrenti * 100) / 100,
        entrateRicorrenti: Math.round(dayEntrateRicorrenti * 100) / 100,
      })
    }

    const saldoFinale = chartData.length > 0 ? chartData[chartData.length - 1].saldo : saldoOggi

    return NextResponse.json({
      saldoOggi: Math.round(saldoOggi * 100) / 100,
      pagamenti: {
        totale: Math.round(pagamentiTotale * 100) / 100,
        ricorrenti: Math.round(pagamentiRicorrenti * 100) / 100,
      },
      incassi: {
        totale: Math.round(incassiTotale * 100) / 100,
        ricorrenti: Math.round(incassiRicorrenti * 100) / 100,
      },
      saldoFinale: Math.round(saldoFinale * 100) / 100,
      scaduto: {
        daPagare: Math.round(scadutoDaPagare * 100) / 100,
        daIncassare: Math.round(scadutoDaIncassare * 100) / 100,
        saldoFinaleIncluso: Math.round((saldoFinale - scadutoDaPagare + scadutoDaIncassare) * 100) / 100,
      },
      chartData,
      range: {
        from: format(today, 'yyyy-MM-dd'),
        to: format(endDate, 'yyyy-MM-dd'),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/saldo-scalare', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo del saldo scalare' },
      { status: 500 }
    )
  }
}
