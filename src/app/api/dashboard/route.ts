import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { it } from 'date-fns/locale'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
// GET /api/dashboard - KPI e statistiche per la dashboard
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const now = new Date()
    const today = startOfDay(now)
    const todayEnd = endOfDay(now)
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Lunedi
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    const lastMonthStart = startOfMonth(subMonths(now, 1))
    const lastMonthEnd = endOfMonth(subMonths(now, 1))

    // Filtro sede
    const venueId = await getVenueId()
    const venueFilter = { venueId }

    // Query parallele per performance
    const [
      closuresToday,
      closuresThisMonth,
      closuresLastMonth,
      journalEntriesThisMonth,
      pendingClosures,
      recentClosures,
      cashDifferences,
      staffToday,
      venues,
    ] = await Promise.all([
      // Chiusure di oggi
      prisma.dailyClosure.count({
        where: {
          ...venueFilter,
          date: {
            gte: today,
            lte: todayEnd,
          },
        },
      }),

      // Chiusure validate del mese (per calcolo incassi)
      prisma.dailyClosure.findMany({
        where: {
          ...venueFilter,
          status: 'VALIDATED',
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        include: {
          stations: {
            select: {
              cashAmount: true,
              posAmount: true,
            },
          },
        },
      }),

      // Chiusure validate mese scorso (per confronto)
      prisma.dailyClosure.findMany({
        where: {
          ...venueFilter,
          status: 'VALIDATED',
          date: {
            gte: lastMonthStart,
            lte: lastMonthEnd,
          },
        },
        include: {
          stations: {
            select: {
              cashAmount: true,
              posAmount: true,
            },
          },
        },
      }),

      // Movimenti prima nota del mese
      prisma.journalEntry.count({
        where: {
          ...venueFilter,
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      }),

      // Chiusure in attesa (DRAFT o SUBMITTED)
      prisma.dailyClosure.findMany({
        where: {
          ...venueFilter,
          status: {
            in: ['DRAFT', 'SUBMITTED'],
          },
        },
        include: {
          venue: {
            select: {
              name: true,
              code: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 10,
      }),

      // Ultime 5 chiusure
      prisma.dailyClosure.findMany({
        where: venueFilter,
        include: {
          venue: {
            select: {
              name: true,
              code: true,
            },
          },
          stations: {
            select: {
              cashAmount: true,
              posAmount: true,
              cashCount: {
                select: {
                  difference: true,
                },
              },
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 5,
      }),

      // Differenze cassa significative (ultime 30 chiusure)
      prisma.dailyClosure.findMany({
        where: {
          ...venueFilter,
          status: 'VALIDATED',
        },
        include: {
          venue: {
            select: {
              name: true,
              code: true,
            },
          },
          stations: {
            include: {
              cashCount: {
                select: {
                  difference: true,
                  totalCounted: true,
                  expectedTotal: true,
                },
              },
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 30,
      }),

      // Staff in servizio oggi
      prisma.dailyAttendance.count({
        where: {
          closure: {
            ...venueFilter,
            date: {
              gte: today,
              lte: todayEnd,
            },
          },
          statusCode: 'P', // Presente
        },
      }),

      // Lista sedi (per admin)
      session.user.role === 'admin'
        ? prisma.venue.findMany({
            where: { isActive: true },
            select: { id: true, name: true, code: true },
          })
        : Promise.resolve([]),
    ])

    // Calcola incassi mensili
    const monthlyIncome = closuresThisMonth.reduce(
      (acc, closure) => {
        closure.stations.forEach((station) => {
          acc.cash += Number(station.cashAmount) || 0
          acc.pos += Number(station.posAmount) || 0
        })
        return acc
      },
      { cash: 0, pos: 0 }
    )
    const monthlyTotal = monthlyIncome.cash + monthlyIncome.pos

    // Calcola incassi mese scorso
    const lastMonthIncome = closuresLastMonth.reduce(
      (acc, closure) => {
        closure.stations.forEach((station) => {
          acc.cash += Number(station.cashAmount) || 0
          acc.pos += Number(station.posAmount) || 0
        })
        return acc
      },
      { cash: 0, pos: 0 }
    )
    const lastMonthTotal = lastMonthIncome.cash + lastMonthIncome.pos

    // Variazione percentuale mese su mese
    const monthlyChange = lastMonthTotal > 0
      ? ((monthlyTotal - lastMonthTotal) / lastMonthTotal) * 100
      : 0

    // Calcola incassi settimana
    const weeklyClosures = closuresThisMonth.filter((c) => {
      const date = new Date(c.date)
      return date >= weekStart && date <= weekEnd
    })
    const weeklyIncome = weeklyClosures.reduce(
      (acc, closure) => {
        closure.stations.forEach((station) => {
          acc.cash += Number(station.cashAmount) || 0
          acc.pos += Number(station.posAmount) || 0
        })
        return acc
      },
      { cash: 0, pos: 0 }
    )
    const weeklyTotal = weeklyIncome.cash + weeklyIncome.pos

    // Calcola incassi oggi
    const todayClosures = closuresThisMonth.filter((c) => {
      const date = new Date(c.date)
      return date >= today && date <= todayEnd
    })
    const todayIncome = todayClosures.reduce(
      (acc, closure) => {
        closure.stations.forEach((station) => {
          acc.cash += Number(station.cashAmount) || 0
          acc.pos += Number(station.posAmount) || 0
        })
        return acc
      },
      { cash: 0, pos: 0 }
    )
    const todayTotal = todayIncome.cash + todayIncome.pos

    // Filtra differenze cassa significative (> 5 euro)
    const significantDifferences = cashDifferences
      .flatMap((closure) =>
        closure.stations
          .filter((station) => {
            const diff = Math.abs(Number(station.cashCount?.difference) || 0)
            return diff > 5
          })
          .map((station) => ({
            closureId: closure.id,
            date: closure.date,
            venue: closure.venue,
            stationName: station.name,
            difference: Number(station.cashCount?.difference) || 0,
            counted: Number(station.cashCount?.totalCounted) || 0,
            expected: Number(station.cashCount?.expectedTotal) || 0,
          }))
      )
      .slice(0, 5) // Mostra solo le ultime 5

    // Formatta ultime chiusure
    const formattedRecentClosures = recentClosures.map((closure) => {
      const totalCash = closure.stations.reduce(
        (sum, s) => sum + (Number(s.cashAmount) || 0),
        0
      )
      const totalPos = closure.stations.reduce(
        (sum, s) => sum + (Number(s.posAmount) || 0),
        0
      )
      const totalDifference = closure.stations.reduce(
        (sum, s) => sum + (Number(s.cashCount?.difference) || 0),
        0
      )

      return {
        id: closure.id,
        date: closure.date,
        dateFormatted: format(new Date(closure.date), 'dd MMM yyyy', { locale: it }),
        venue: closure.venue,
        status: closure.status,
        totalIncome: totalCash + totalPos,
        cashDifference: totalDifference,
      }
    })

    // Formatta chiusure pending
    const formattedPendingClosures = pendingClosures.map((closure) => ({
      id: closure.id,
      date: closure.date,
      dateFormatted: format(new Date(closure.date), 'dd MMM yyyy', { locale: it }),
      venue: closure.venue,
      status: closure.status,
    }))

    return NextResponse.json({
      // KPI principali
      stats: {
        closuresToday,
        journalEntriesThisMonth,
        staffToday,
      },

      // Incassi
      income: {
        today: {
          cash: todayIncome.cash,
          pos: todayIncome.pos,
          total: todayTotal,
        },
        week: {
          cash: weeklyIncome.cash,
          pos: weeklyIncome.pos,
          total: weeklyTotal,
        },
        month: {
          cash: monthlyIncome.cash,
          pos: monthlyIncome.pos,
          total: monthlyTotal,
          change: monthlyChange,
          daysWorked: closuresThisMonth.length,
          avgDaily: closuresThisMonth.length > 0
            ? monthlyTotal / closuresThisMonth.length
            : 0,
        },
        lastMonth: {
          total: lastMonthTotal,
          daysWorked: closuresLastMonth.length,
        },
      },

      // Chiusure
      closures: {
        pending: formattedPendingClosures,
        pendingCount: pendingClosures.length,
        recent: formattedRecentClosures,
      },

      // Differenze cassa
      cashDifferences: significantDifferences,
      hasCashIssues: significantDifferences.length > 0,

      // Metadati
      meta: {
        isAdmin: session.user.role === 'admin',
        venues: venues,
        currentMonth: format(now, 'MMMM yyyy', { locale: it }),
        currentWeek: `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM')}`,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/dashboard', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei dati dashboard' },
      { status: 500 }
    )
  }
}
