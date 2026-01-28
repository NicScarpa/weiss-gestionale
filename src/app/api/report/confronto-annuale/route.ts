import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfYear, endOfYear, format, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { it } from 'date-fns/locale'

import { logger } from '@/lib/logger'
// GET /api/report/confronto-annuale - Report confronto year-over-year
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const venueId = searchParams.get('venueId')

    // Anno di default: anno corrente
    const currentYear = yearParam ? parseInt(yearParam) : new Date().getFullYear()
    const previousYear = currentYear - 1

    // Date range per anno corrente e precedente
    const currentYearStart = startOfYear(new Date(currentYear, 0, 1))
    const currentYearEnd = endOfYear(new Date(currentYear, 0, 1))
    const previousYearStart = startOfYear(new Date(previousYear, 0, 1))
    const previousYearEnd = endOfYear(new Date(previousYear, 0, 1))

    // Determina la sede da filtrare
    let targetVenueId: string | undefined

    if (session.user.role !== 'admin') {
      targetVenueId = session.user.venueId || undefined
    } else if (venueId) {
      targetVenueId = venueId
    }

    // Query parallele per entrambi gli anni (ottimizzazione performance)
    const [currentYearClosures, previousYearClosures] = await Promise.all([
      // Query chiusure per anno corrente
      prisma.dailyClosure.findMany({
        where: {
          status: 'VALIDATED',
          date: {
            gte: currentYearStart,
            lte: currentYearEnd,
          },
          ...(targetVenueId && { venueId: targetVenueId }),
        },
        select: {
          id: true,
          date: true,
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
        },
      }),
      // Query chiusure per anno precedente
      prisma.dailyClosure.findMany({
        where: {
          status: 'VALIDATED',
          date: {
            gte: previousYearStart,
            lte: previousYearEnd,
          },
          ...(targetVenueId && { venueId: targetVenueId }),
        },
        select: {
          id: true,
          date: true,
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
        },
      }),
    ])

    // Helper per calcolare totali di una chiusura
    const calculateClosureTotals = (closure: typeof currentYearClosures[0]) => {
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
      return {
        gross: cashTotal + posTotal,
        cash: cashTotal,
        pos: posTotal,
        expenses: expensesTotal,
        net: cashTotal + posTotal - expensesTotal,
      }
    }

    // Genera lista mesi
    const months = eachMonthOfInterval({
      start: new Date(currentYear, 0, 1),
      end: new Date(currentYear, 11, 31),
    })

    // Calcola dati mensili
    const monthlyData = months.map((monthDate) => {
      const monthStart = startOfMonth(monthDate)
      const monthEnd = endOfMonth(monthDate)
      const monthNum = monthDate.getMonth()

      // Filtra chiusure per questo mese (anno corrente)
      const currentMonthClosures = currentYearClosures.filter((c) => {
        const date = new Date(c.date)
        return date >= monthStart && date <= monthEnd
      })

      // Filtra chiusure per stesso mese (anno precedente)
      const previousMonthStart = startOfMonth(new Date(previousYear, monthNum, 1))
      const previousMonthEnd = endOfMonth(new Date(previousYear, monthNum, 1))
      const previousMonthClosures = previousYearClosures.filter((c) => {
        const date = new Date(c.date)
        return date >= previousMonthStart && date <= previousMonthEnd
      })

      // Calcola totali mese corrente
      const currentTotals = currentMonthClosures.reduce(
        (acc, closure) => {
          const totals = calculateClosureTotals(closure)
          return {
            gross: acc.gross + totals.gross,
            cash: acc.cash + totals.cash,
            pos: acc.pos + totals.pos,
            expenses: acc.expenses + totals.expenses,
            net: acc.net + totals.net,
            days: acc.days + 1,
          }
        },
        { gross: 0, cash: 0, pos: 0, expenses: 0, net: 0, days: 0 }
      )

      // Calcola totali mese precedente
      const previousTotals = previousMonthClosures.reduce(
        (acc, closure) => {
          const totals = calculateClosureTotals(closure)
          return {
            gross: acc.gross + totals.gross,
            cash: acc.cash + totals.cash,
            pos: acc.pos + totals.pos,
            expenses: acc.expenses + totals.expenses,
            net: acc.net + totals.net,
            days: acc.days + 1,
          }
        },
        { gross: 0, cash: 0, pos: 0, expenses: 0, net: 0, days: 0 }
      )

      // Calcola variazione percentuale
      const changePercentage = previousTotals.gross > 0
        ? ((currentTotals.gross - previousTotals.gross) / previousTotals.gross) * 100
        : currentTotals.gross > 0 ? 100 : 0

      return {
        month: format(monthDate, 'MMMM', { locale: it }),
        monthShort: format(monthDate, 'MMM', { locale: it }),
        monthNumber: monthNum + 1,
        current: {
          gross: currentTotals.gross,
          cash: currentTotals.cash,
          pos: currentTotals.pos,
          expenses: currentTotals.expenses,
          net: currentTotals.net,
          days: currentTotals.days,
          avgDaily: currentTotals.days > 0 ? currentTotals.gross / currentTotals.days : 0,
        },
        previous: {
          gross: previousTotals.gross,
          cash: previousTotals.cash,
          pos: previousTotals.pos,
          expenses: previousTotals.expenses,
          net: previousTotals.net,
          days: previousTotals.days,
          avgDaily: previousTotals.days > 0 ? previousTotals.gross / previousTotals.days : 0,
        },
        change: {
          amount: currentTotals.gross - previousTotals.gross,
          percentage: changePercentage,
        },
      }
    })

    // Calcola totali annuali
    const currentYearTotals = monthlyData.reduce(
      (acc, month) => ({
        gross: acc.gross + month.current.gross,
        cash: acc.cash + month.current.cash,
        pos: acc.pos + month.current.pos,
        expenses: acc.expenses + month.current.expenses,
        net: acc.net + month.current.net,
        days: acc.days + month.current.days,
      }),
      { gross: 0, cash: 0, pos: 0, expenses: 0, net: 0, days: 0 }
    )

    const previousYearTotals = monthlyData.reduce(
      (acc, month) => ({
        gross: acc.gross + month.previous.gross,
        cash: acc.cash + month.previous.cash,
        pos: acc.pos + month.previous.pos,
        expenses: acc.expenses + month.previous.expenses,
        net: acc.net + month.previous.net,
        days: acc.days + month.previous.days,
      }),
      { gross: 0, cash: 0, pos: 0, expenses: 0, net: 0, days: 0 }
    )

    const yearOverYearChange = {
      amount: currentYearTotals.gross - previousYearTotals.gross,
      percentage: previousYearTotals.gross > 0
        ? ((currentYearTotals.gross - previousYearTotals.gross) / previousYearTotals.gross) * 100
        : currentYearTotals.gross > 0 ? 100 : 0,
    }

    // Trova mese migliore e peggiore (anno corrente)
    const sortedMonths = [...monthlyData]
      .filter((m) => m.current.gross > 0)
      .sort((a, b) => b.current.gross - a.current.gross)

    const bestMonth = sortedMonths[0] || null
    const worstMonth = sortedMonths[sortedMonths.length - 1] || null

    // Mesi con maggiore crescita/calo
    const sortedByChange = [...monthlyData]
      .filter((m) => m.current.gross > 0 || m.previous.gross > 0)
      .sort((a, b) => b.change.percentage - a.change.percentage)

    const bestGrowthMonth = sortedByChange[0] || null
    const worstGrowthMonth = sortedByChange[sortedByChange.length - 1] || null

    // Lista anni disponibili (per il selettore)
    const availableYears = await prisma.dailyClosure.findMany({
      where: {
        status: 'VALIDATED',
        ...(targetVenueId && { venueId: targetVenueId }),
      },
      select: {
        date: true,
      },
      distinct: ['date'],
    })

    const yearsSet = new Set<number>()
    availableYears.forEach((c) => {
      yearsSet.add(new Date(c.date).getFullYear())
    })
    const years = Array.from(yearsSet).sort((a, b) => b - a)

    return NextResponse.json({
      currentYear,
      previousYear,
      monthlyData,
      totals: {
        current: currentYearTotals,
        previous: previousYearTotals,
        change: yearOverYearChange,
      },
      highlights: {
        bestMonth,
        worstMonth,
        bestGrowthMonth,
        worstGrowthMonth,
      },
      availableYears: years,
    })
  } catch (error) {
    logger.error('Errore GET /api/report/confronto-annuale', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei dati' },
      { status: 500 }
    )
  }
}
