import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
// GET /api/report/incassi-giornalieri - Report incassi giornalieri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const venueId = searchParams.get('venueId')
    const _groupBy = searchParams.get('groupBy') || 'day' // day, week, month

    // Date di default: mese corrente
    const now = new Date()
    const defaultDateFrom = startOfMonth(now)
    const defaultDateTo = endOfMonth(now)

    const startDate = dateFrom ? parseISO(dateFrom) : defaultDateFrom
    const endDate = dateTo ? parseISO(dateTo) : defaultDateTo

    // Determina la sede da filtrare
    const targetVenueId = await getVenueId()

    // Query chiusure validate nel periodo
    const closures = await prisma.dailyClosure.findMany({
      where: {
        status: 'VALIDATED',
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(targetVenueId && { venueId: targetVenueId }),
      },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
        stations: {
          select: {
            cashAmount: true,
            posAmount: true,
          },
        },
        expenses: {
          select: {
            amount: true,
          },
        },
        partials: {
          select: {
            timeSlot: true,
            receiptProgressive: true,
            posProgressive: true,
            coffeeDelta: true,
            weather: true,
          },
          orderBy: { timeSlot: 'asc' as const },
        },
      },
      orderBy: { date: 'asc' },
    })

    // Calcola totali per ogni chiusura
    const dailyData = closures.map((closure) => {
      const cashTotal = closure.stations.reduce(
        (sum, s) => sum + (Number(s.cashAmount) || 0),
        0
      )
      const posTotal = closure.stations.reduce(
        (sum, s) => sum + (Number(s.posAmount) || 0),
        0
      )
      const expensesTotal = closure.expenses.reduce(
        (sum, e) => sum + (Number(e.amount) || 0),
        0
      )
      const grossTotal = cashTotal + posTotal

      return {
        date: format(closure.date, 'yyyy-MM-dd'),
        displayDate: format(closure.date, 'dd/MM/yyyy'),
        dayOfWeek: format(closure.date, 'EEE', { locale: it }).toUpperCase(),
        venue: closure.venue,
        cashTotal,
        posTotal,
        grossTotal,
        expensesTotal,
        netTotal: grossTotal - expensesTotal,
        isEvent: closure.isEvent,
        eventName: closure.eventName,
        partials: closure.partials.map((p) => ({
          timeSlot: p.timeSlot,
          receiptProgressive: Number(p.receiptProgressive) || 0,
          posProgressive: Number(p.posProgressive) || 0,
          coffeeDelta: p.coffeeDelta,
          weather: p.weather,
        })),
      }
    })

    // Calcola totali del periodo
    const totals = dailyData.reduce(
      (acc, day) => ({
        cashTotal: acc.cashTotal + day.cashTotal,
        posTotal: acc.posTotal + day.posTotal,
        grossTotal: acc.grossTotal + day.grossTotal,
        expensesTotal: acc.expensesTotal + day.expensesTotal,
        netTotal: acc.netTotal + day.netTotal,
        daysCount: acc.daysCount + 1,
      }),
      { cashTotal: 0, posTotal: 0, grossTotal: 0, expensesTotal: 0, netTotal: 0, daysCount: 0 }
    )

    // Calcola medie
    const averages = {
      dailyGross: totals.daysCount > 0 ? totals.grossTotal / totals.daysCount : 0,
      dailyNet: totals.daysCount > 0 ? totals.netTotal / totals.daysCount : 0,
      dailyCash: totals.daysCount > 0 ? totals.cashTotal / totals.daysCount : 0,
      dailyPos: totals.daysCount > 0 ? totals.posTotal / totals.daysCount : 0,
    }

    // Trova giorno migliore e peggiore
    const sortedByGross = [...dailyData].sort((a, b) => b.grossTotal - a.grossTotal)
    const bestDay = sortedByGross[0] || null
    const worstDay = sortedByGross[sortedByGross.length - 1] || null

    // Calcola percentuale contanti vs POS
    const paymentBreakdown = {
      cashPercentage: totals.grossTotal > 0 ? (totals.cashTotal / totals.grossTotal) * 100 : 0,
      posPercentage: totals.grossTotal > 0 ? (totals.posTotal / totals.grossTotal) * 100 : 0,
    }

    // Confronto con periodo precedente (stesso range ma mese prima)
    const previousStartDate = subMonths(startDate, 1)
    const previousEndDate = subMonths(endDate, 1)

    const previousClosures = await prisma.dailyClosure.findMany({
      where: {
        status: 'VALIDATED',
        date: {
          gte: previousStartDate,
          lte: previousEndDate,
        },
        ...(targetVenueId && { venueId: targetVenueId }),
      },
      include: {
        stations: {
          select: {
            cashAmount: true,
            posAmount: true,
          },
        },
      },
    })

    const previousTotals = previousClosures.reduce(
      (acc, closure) => {
        const cashTotal = closure.stations.reduce(
          (sum, s) => sum + (Number(s.cashAmount) || 0),
          0
        )
        const posTotal = closure.stations.reduce(
          (sum, s) => sum + (Number(s.posAmount) || 0),
          0
        )
        return {
          grossTotal: acc.grossTotal + cashTotal + posTotal,
          daysCount: acc.daysCount + 1,
        }
      },
      { grossTotal: 0, daysCount: 0 }
    )

    const comparison = {
      previousGrossTotal: previousTotals.grossTotal,
      previousDaysCount: previousTotals.daysCount,
      changePercentage: previousTotals.grossTotal > 0
        ? ((totals.grossTotal - previousTotals.grossTotal) / previousTotals.grossTotal) * 100
        : 0,
      changeAmount: totals.grossTotal - previousTotals.grossTotal,
    }

    return NextResponse.json({
      period: {
        from: format(startDate, 'yyyy-MM-dd'),
        to: format(endDate, 'yyyy-MM-dd'),
        displayFrom: format(startDate, 'dd/MM/yyyy'),
        displayTo: format(endDate, 'dd/MM/yyyy'),
      },
      data: dailyData,
      totals,
      averages,
      bestDay,
      worstDay,
      paymentBreakdown,
      comparison,
    })
  } catch (error) {
    logger.error('Errore GET /api/report/incassi-giornalieri', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei dati' },
      { status: 500 }
    )
  }
}
