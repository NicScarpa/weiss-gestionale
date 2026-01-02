import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfYear, endOfYear, format, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { it } from 'date-fns/locale'

// GET /api/report/riepilogo-mensile - Report riepilogo mensile
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
    const selectedYear = yearParam ? parseInt(yearParam) : new Date().getFullYear()

    // Date range per l'anno selezionato
    const yearStart = startOfYear(new Date(selectedYear, 0, 1))
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1))

    // Determina la sede da filtrare
    let targetVenueId: string | undefined

    if (session.user.role !== 'admin') {
      targetVenueId = session.user.venueId || undefined
    } else if (venueId) {
      targetVenueId = venueId
    }

    // Query chiusure validate per l'anno
    const closures = await prisma.dailyClosure.findMany({
      where: {
        status: 'VALIDATED',
        date: {
          gte: yearStart,
          lte: yearEnd,
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
        expenses: {
          select: {
            amount: true,
            accountId: true,
            account: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    })

    // Genera lista mesi
    const months = eachMonthOfInterval({
      start: new Date(selectedYear, 0, 1),
      end: new Date(selectedYear, 11, 31),
    })

    // Calcola dati mensili
    const monthlyData = months.map((monthDate) => {
      const monthStart = startOfMonth(monthDate)
      const monthEnd = endOfMonth(monthDate)

      // Filtra chiusure per questo mese
      const monthClosures = closures.filter((c) => {
        const date = new Date(c.date)
        return date >= monthStart && date <= monthEnd
      })

      // Calcola totali
      let totalCash = 0
      let totalPos = 0
      let totalExpenses = 0
      const expensesByAccount: Record<string, { id: string; code: string; name: string; amount: number }> = {}

      monthClosures.forEach((closure) => {
        // Incassi
        closure.stations.forEach((station) => {
          totalCash += Number(station.cashAmount) || 0
          totalPos += Number(station.posAmount) || 0
        })

        // Spese per categoria
        closure.expenses.forEach((expense) => {
          const amount = Number(expense.amount) || 0
          totalExpenses += amount

          if (expense.account) {
            const accountKey = expense.account.id
            if (!expensesByAccount[accountKey]) {
              expensesByAccount[accountKey] = {
                id: expense.account.id,
                code: expense.account.code,
                name: expense.account.name,
                amount: 0,
              }
            }
            expensesByAccount[accountKey].amount += amount
          } else {
            // Spese senza categoria
            if (!expensesByAccount['uncategorized']) {
              expensesByAccount['uncategorized'] = {
                id: 'uncategorized',
                code: '---',
                name: 'Non categorizzate',
                amount: 0,
              }
            }
            expensesByAccount['uncategorized'].amount += amount
          }
        })
      })

      const grossIncome = totalCash + totalPos
      const netIncome = grossIncome - totalExpenses

      return {
        month: format(monthDate, 'MMMM', { locale: it }),
        monthShort: format(monthDate, 'MMM', { locale: it }),
        monthNumber: monthDate.getMonth() + 1,
        year: selectedYear,
        daysWorked: monthClosures.length,
        income: {
          cash: totalCash,
          pos: totalPos,
          gross: grossIncome,
          avgDaily: monthClosures.length > 0 ? grossIncome / monthClosures.length : 0,
        },
        expenses: {
          total: totalExpenses,
          byAccount: Object.values(expensesByAccount).sort((a, b) => b.amount - a.amount),
          avgDaily: monthClosures.length > 0 ? totalExpenses / monthClosures.length : 0,
        },
        net: {
          total: netIncome,
          avgDaily: monthClosures.length > 0 ? netIncome / monthClosures.length : 0,
        },
        margin: grossIncome > 0 ? (netIncome / grossIncome) * 100 : 0,
      }
    })

    // Calcola totali annuali
    const yearTotals = monthlyData.reduce(
      (acc, month) => ({
        daysWorked: acc.daysWorked + month.daysWorked,
        income: {
          cash: acc.income.cash + month.income.cash,
          pos: acc.income.pos + month.income.pos,
          gross: acc.income.gross + month.income.gross,
        },
        expenses: {
          total: acc.expenses.total + month.expenses.total,
        },
        net: {
          total: acc.net.total + month.net.total,
        },
      }),
      {
        daysWorked: 0,
        income: { cash: 0, pos: 0, gross: 0 },
        expenses: { total: 0 },
        net: { total: 0 },
      }
    )

    // Aggrega spese per categoria (anno intero)
    const yearExpensesByAccount: Record<string, { id: string; code: string; name: string; amount: number }> = {}
    monthlyData.forEach((month) => {
      month.expenses.byAccount.forEach((account) => {
        if (!yearExpensesByAccount[account.id]) {
          yearExpensesByAccount[account.id] = { ...account, amount: 0 }
        }
        yearExpensesByAccount[account.id].amount += account.amount
      })
    })

    // Trova mese migliore e peggiore per incasso lordo
    const monthsWithData = monthlyData.filter((m) => m.income.gross > 0)
    const sortedByGross = [...monthsWithData].sort((a, b) => b.income.gross - a.income.gross)
    const bestMonth = sortedByGross[0] || null
    const worstMonth = sortedByGross[sortedByGross.length - 1] || null

    // Mese con più/meno spese
    const monthsWithExpenses = monthlyData.filter((m) => m.expenses.total > 0)
    const sortedByExpenses = [...monthsWithExpenses].sort((a, b) => b.expenses.total - a.expenses.total)
    const highestExpensesMonth = sortedByExpenses[0] || null
    const lowestExpensesMonth = sortedByExpenses[sortedByExpenses.length - 1] || null

    // Mese con margine migliore/peggiore
    const sortedByMargin = [...monthsWithData].sort((a, b) => b.margin - a.margin)
    const bestMarginMonth = sortedByMargin[0] || null
    const worstMarginMonth = sortedByMargin[sortedByMargin.length - 1] || null

    // Lista anni disponibili
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

    // Calcola medie annuali
    const yearAverages = {
      dailyGross: yearTotals.daysWorked > 0 ? yearTotals.income.gross / yearTotals.daysWorked : 0,
      dailyExpenses: yearTotals.daysWorked > 0 ? yearTotals.expenses.total / yearTotals.daysWorked : 0,
      dailyNet: yearTotals.daysWorked > 0 ? yearTotals.net.total / yearTotals.daysWorked : 0,
      monthlyGross: monthsWithData.length > 0 ? yearTotals.income.gross / monthsWithData.length : 0,
      monthlyExpenses: monthsWithExpenses.length > 0 ? yearTotals.expenses.total / monthsWithExpenses.length : 0,
      monthlyNet: monthsWithData.length > 0 ? yearTotals.net.total / monthsWithData.length : 0,
    }

    // Margine annuale
    const yearMargin = yearTotals.income.gross > 0
      ? (yearTotals.net.total / yearTotals.income.gross) * 100
      : 0

    return NextResponse.json({
      year: selectedYear,
      monthlyData,
      totals: {
        ...yearTotals,
        margin: yearMargin,
        expensesByAccount: Object.values(yearExpensesByAccount).sort((a, b) => b.amount - a.amount),
      },
      averages: yearAverages,
      highlights: {
        bestMonth,
        worstMonth,
        highestExpensesMonth,
        lowestExpensesMonth,
        bestMarginMonth,
        worstMarginMonth,
      },
      availableYears: years,
    })
  } catch (error) {
    console.error('Errore GET /api/report/riepilogo-mensile:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei dati' },
      { status: 500 }
    )
  }
}
