import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth, subMonths, format, parseISO, eachMonthOfInterval, startOfYear, endOfYear } from 'date-fns'
import { it } from 'date-fns/locale'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
// GET /api/report/analisi-costi - Report analisi costi
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
    const _groupBy = searchParams.get('groupBy') || 'category' // category, payee, month

    // Date di default: anno corrente
    const now = new Date()
    const defaultDateFrom = startOfYear(now)
    const defaultDateTo = endOfYear(now)

    const startDate = dateFrom ? parseISO(dateFrom) : defaultDateFrom
    const endDate = dateTo ? parseISO(dateTo) : defaultDateTo

    // Determina la sede da filtrare
    const targetVenueId = await getVenueId()

    // Query spese da chiusure validate
    const expenses = await prisma.dailyExpense.findMany({
      where: {
        closure: {
          status: 'VALIDATED',
          date: {
            gte: startDate,
            lte: endDate,
          },
          ...(targetVenueId && { venueId: targetVenueId }),
        },
      },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        closure: {
          select: {
            date: true,
            venue: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
      orderBy: {
        closure: {
          date: 'asc',
        },
      },
    })

    // Calcola totale generale
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

    // Raggruppa per categoria (account)
    const byCategory: Record<string, {
      id: string
      code: string
      name: string
      amount: number
      count: number
      percentage: number
      avgAmount: number
    }> = {}

    expenses.forEach((expense) => {
      const accountKey = expense.account?.id || 'uncategorized'
      const accountCode = expense.account?.code || '---'
      const accountName = expense.account?.name || 'Non categorizzate'

      if (!byCategory[accountKey]) {
        byCategory[accountKey] = {
          id: accountKey,
          code: accountCode,
          name: accountName,
          amount: 0,
          count: 0,
          percentage: 0,
          avgAmount: 0,
        }
      }

      byCategory[accountKey].amount += Number(expense.amount) || 0
      byCategory[accountKey].count += 1
    })

    // Calcola percentuali e medie per categoria
    Object.values(byCategory).forEach((cat) => {
      cat.percentage = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0
      cat.avgAmount = cat.count > 0 ? cat.amount / cat.count : 0
    })

    const categoriesData = Object.values(byCategory).sort((a, b) => b.amount - a.amount)

    // Raggruppa per fornitore/beneficiario (payee)
    const byPayee: Record<string, {
      payee: string
      amount: number
      count: number
      percentage: number
      avgAmount: number
      categories: string[]
    }> = {}

    expenses.forEach((expense) => {
      const payeeKey = expense.payee.toLowerCase().trim()
      const payeeName = expense.payee.trim()

      if (!byPayee[payeeKey]) {
        byPayee[payeeKey] = {
          payee: payeeName,
          amount: 0,
          count: 0,
          percentage: 0,
          avgAmount: 0,
          categories: [],
        }
      }

      byPayee[payeeKey].amount += Number(expense.amount) || 0
      byPayee[payeeKey].count += 1

      const categoryName = expense.account?.name || 'Non categorizzate'
      if (!byPayee[payeeKey].categories.includes(categoryName)) {
        byPayee[payeeKey].categories.push(categoryName)
      }
    })

    // Calcola percentuali e medie per fornitore
    Object.values(byPayee).forEach((p) => {
      p.percentage = totalExpenses > 0 ? (p.amount / totalExpenses) * 100 : 0
      p.avgAmount = p.count > 0 ? p.amount / p.count : 0
    })

    const payeesData = Object.values(byPayee).sort((a, b) => b.amount - a.amount)

    // Raggruppa per mese
    const months = eachMonthOfInterval({ start: startDate, end: endDate })
    const byMonth = months.map((monthDate) => {
      const monthStart = startOfMonth(monthDate)
      const monthEnd = endOfMonth(monthDate)

      const monthExpenses = expenses.filter((e) => {
        const expenseDate = new Date(e.closure.date)
        return expenseDate >= monthStart && expenseDate <= monthEnd
      })

      const monthTotal = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      const monthCount = monthExpenses.length

      // Breakdown per categoria nel mese
      const monthByCategory: Record<string, number> = {}
      monthExpenses.forEach((expense) => {
        const categoryName = expense.account?.name || 'Non categorizzate'
        monthByCategory[categoryName] = (monthByCategory[categoryName] || 0) + (Number(expense.amount) || 0)
      })

      return {
        month: format(monthDate, 'MMMM yyyy', { locale: it }),
        monthShort: format(monthDate, 'MMM', { locale: it }),
        monthKey: format(monthDate, 'yyyy-MM'),
        amount: monthTotal,
        count: monthCount,
        avgAmount: monthCount > 0 ? monthTotal / monthCount : 0,
        byCategory: Object.entries(monthByCategory)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount),
      }
    })

    // Calcola trend mensile (variazione rispetto al mese precedente)
    const monthlyTrend = byMonth.map((month, index) => {
      const previousMonth = index > 0 ? byMonth[index - 1] : null
      const change = previousMonth
        ? month.amount - previousMonth.amount
        : 0
      const changePercentage = previousMonth && previousMonth.amount > 0
        ? ((month.amount - previousMonth.amount) / previousMonth.amount) * 100
        : 0

      return {
        ...month,
        change,
        changePercentage,
      }
    })

    // Top 10 spese singole più alte
    const topExpenses = [...expenses]
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        date: format(new Date(e.closure.date), 'dd/MM/yyyy'),
        payee: e.payee,
        description: e.description,
        amount: Number(e.amount) || 0,
        category: e.account?.name || 'Non categorizzate',
        venue: e.closure.venue.name,
      }))

    // Statistiche generali
    const stats = {
      totalExpenses,
      expenseCount: expenses.length,
      avgExpense: expenses.length > 0 ? totalExpenses / expenses.length : 0,
      categoriesCount: categoriesData.length,
      payeesCount: payeesData.length,
      monthsWithExpenses: byMonth.filter((m) => m.amount > 0).length,
      avgMonthly: byMonth.length > 0 ? totalExpenses / byMonth.filter((m) => m.amount > 0).length : 0,
    }

    // Highlights
    const topCategory = categoriesData[0] || null
    const topPayee = payeesData[0] || null
    const highestMonth = [...monthlyTrend].sort((a, b) => b.amount - a.amount)[0] || null
    const lowestMonth = [...monthlyTrend].filter((m) => m.amount > 0).sort((a, b) => a.amount - b.amount)[0] || null

    // Confronto con periodo precedente
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const previousStartDate = subMonths(startDate, Math.ceil(periodDays / 30))
    const previousEndDate = subMonths(endDate, Math.ceil(periodDays / 30))

    const previousExpenses = await prisma.dailyExpense.findMany({
      where: {
        closure: {
          status: 'VALIDATED',
          date: {
            gte: previousStartDate,
            lte: previousEndDate,
          },
          ...(targetVenueId && { venueId: targetVenueId }),
        },
      },
      select: {
        amount: true,
      },
    })

    const previousTotal = previousExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const comparison = {
      previousTotal,
      change: totalExpenses - previousTotal,
      changePercentage: previousTotal > 0
        ? ((totalExpenses - previousTotal) / previousTotal) * 100
        : totalExpenses > 0 ? 100 : 0,
    }

    return NextResponse.json({
      period: {
        from: format(startDate, 'yyyy-MM-dd'),
        to: format(endDate, 'yyyy-MM-dd'),
        displayFrom: format(startDate, 'dd/MM/yyyy'),
        displayTo: format(endDate, 'dd/MM/yyyy'),
      },
      stats,
      byCategory: categoriesData,
      byPayee: payeesData,
      byMonth: monthlyTrend,
      topExpenses,
      highlights: {
        topCategory,
        topPayee,
        highestMonth,
        lowestMonth,
      },
      comparison,
    })
  } catch (error) {
    logger.error('Errore GET /api/report/analisi-costi', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei dati' },
      { status: 500 }
    )
  }
}
