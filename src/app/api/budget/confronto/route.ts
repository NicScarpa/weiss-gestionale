import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { budgetComparisonFiltersSchema } from '@/lib/validations/budget'
import {
  type MonthlyValues,
  type MonthKey,
  MONTH_KEYS,
  MONTH_NUMBER_TO_KEY,
} from '@/types/budget'
import {
  emptyMonthlyValues,
  calculateVariance,
  calculateVariancePercent,
  calculateAnnualTotal,
  budgetLineToMonthlyValues,
} from '@/lib/budget-utils'

import { logger } from '@/lib/logger'
// GET /api/budget/confronto - Confronto budget vs actual
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Parse filtri
    const filters = budgetComparisonFiltersSchema.parse({
      venueId: searchParams.get('venueId') || undefined,
      year: searchParams.get('year') || new Date().getFullYear(),
      month: searchParams.get('month') || undefined,
      accountType: searchParams.get('accountType') || 'ALL',
    })

    // Determina venueId
    let venueId = filters.venueId
    if (session.user.role !== 'admin') {
      venueId = session.user.venueId || undefined
    }

    if (!venueId) {
      return NextResponse.json(
        { error: 'Sede non specificata' },
        { status: 400 }
      )
    }

    // Recupera il budget attivo per l'anno
    const budget = await prisma.budget.findFirst({
      where: {
        venueId,
        year: filters.year,
        status: { in: ['ACTIVE', 'DRAFT'] },
      },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: {
        status: 'asc', // ACTIVE prima di DRAFT
      },
    })

    if (!budget) {
      return NextResponse.json(
        { error: `Nessun budget trovato per l'anno ${filters.year}` },
        { status: 404 }
      )
    }

    // Recupera gli actual (da JournalEntry per ricavi e spese registrate)
    const yearStart = new Date(filters.year, 0, 1)
    const yearEnd = new Date(filters.year, 11, 31, 23, 59, 59)

    // Recupera ricavi (totalRevenue dalle chiusure validate)
    const revenues = await prisma.dailyClosure.findMany({
      where: {
        venueId,
        status: 'VALIDATED',
        date: {
          gte: yearStart,
          lte: yearEnd,
        },
      },
      select: {
        date: true,
        stations: {
          select: {
            receiptAmount: true,
            invoiceAmount: true,
          },
        },
      },
    })

    // Raggruppa ricavi per mese
    const revenueByMonth = emptyMonthlyValues()
    revenues.forEach((closure) => {
      const month = new Date(closure.date).getMonth() + 1
      const monthKey = MONTH_NUMBER_TO_KEY[month]
      const total = closure.stations.reduce(
        (sum, s) => sum + Number(s.receiptAmount) + Number(s.invoiceAmount),
        0
      )
      revenueByMonth[monthKey] += total
    })

    // Recupera costi (da DailyExpense raggruppate per conto)
    const expenses = await prisma.dailyExpense.findMany({
      where: {
        closure: {
          venueId,
          status: 'VALIDATED',
          date: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
      },
      select: {
        amount: true,
        accountId: true,
        closure: {
          select: {
            date: true,
          },
        },
      },
    })

    // Raggruppa spese per conto e mese
    const expensesByAccountAndMonth: Record<string, MonthlyValues> = {}
    expenses.forEach((expense) => {
      if (!expense.accountId) return

      if (!expensesByAccountAndMonth[expense.accountId]) {
        expensesByAccountAndMonth[expense.accountId] = emptyMonthlyValues()
      }

      const month = new Date(expense.closure.date).getMonth() + 1
      const monthKey = MONTH_NUMBER_TO_KEY[month]
      expensesByAccountAndMonth[expense.accountId][monthKey] += Number(expense.amount)
    })

    // Costruisci la comparazione per ogni riga budget
    const comparisons: any[] = []

    for (const line of budget.lines) {
      const account = line.account
      if (!account) continue

      // Filtra per tipo se specificato
      if (filters.accountType !== 'ALL' && account.type !== filters.accountType) {
        continue
      }

      const budgetValues = budgetLineToMonthlyValues(line)
      let actualValues: MonthlyValues

      if (account.type === 'RICAVO') {
        // Per i ricavi, usiamo i totali delle chiusure
        // Nota: in produzione si dovrebbe mappare il conto specifico
        actualValues = revenueByMonth
      } else {
        // Per i costi, usiamo le spese per conto
        actualValues = expensesByAccountAndMonth[account.id] || emptyMonthlyValues()
      }

      // Calcola varianza per ogni mese
      const varianceValues: MonthlyValues = {} as MonthlyValues
      const variancePercentValues: MonthlyValues = {} as MonthlyValues

      for (const key of MONTH_KEYS) {
        varianceValues[key] = calculateVariance(budgetValues[key], actualValues[key])
        variancePercentValues[key] = calculateVariancePercent(budgetValues[key], actualValues[key])
      }

      const budgetAnnual = calculateAnnualTotal(budgetValues)
      const actualAnnual = calculateAnnualTotal(actualValues)
      const varianceAnnual = calculateVariance(budgetAnnual, actualAnnual)
      const variancePercentAnnual = calculateVariancePercent(budgetAnnual, actualAnnual)

      comparisons.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        budget: { ...budgetValues, annual: budgetAnnual },
        actual: { ...actualValues, annual: actualAnnual },
        variance: { ...varianceValues, annual: varianceAnnual },
        variancePercent: { ...variancePercentValues, annual: variancePercentAnnual },
      })
    }

    // Ordina per codice conto
    comparisons.sort((a, b) => a.accountCode.localeCompare(b.accountCode))

    // Calcola sommario
    const ricaviComparisons = comparisons.filter((c) => c.accountType === 'RICAVO')
    const costiComparisons = comparisons.filter((c) => c.accountType === 'COSTO')

    const totalBudgetRicavi = ricaviComparisons.reduce((sum, c) => sum + c.budget.annual, 0)
    const totalActualRicavi = ricaviComparisons.reduce((sum, c) => sum + c.actual.annual, 0)
    const totalBudgetCosti = costiComparisons.reduce((sum, c) => sum + c.budget.annual, 0)
    const totalActualCosti = costiComparisons.reduce((sum, c) => sum + c.actual.annual, 0)

    const summary = {
      period: {
        year: filters.year,
        month: filters.month,
      },
      totalBudget: totalBudgetRicavi + totalBudgetCosti,
      totalActual: totalActualRicavi + totalActualCosti,
      totalVariance: (totalActualRicavi - totalBudgetRicavi) + (totalActualCosti - totalBudgetCosti),
      totalVariancePercent: calculateVariancePercent(
        totalBudgetRicavi + totalBudgetCosti,
        totalActualRicavi + totalActualCosti
      ),
      byType: {
        RICAVO: {
          budget: totalBudgetRicavi,
          actual: totalActualRicavi,
          variance: calculateVariance(totalBudgetRicavi, totalActualRicavi),
          variancePercent: calculateVariancePercent(totalBudgetRicavi, totalActualRicavi),
        },
        COSTO: {
          budget: totalBudgetCosti,
          actual: totalActualCosti,
          variance: calculateVariance(totalBudgetCosti, totalActualCosti),
          variancePercent: calculateVariancePercent(totalBudgetCosti, totalActualCosti),
        },
      },
      budgetId: budget.id,
      budgetStatus: budget.status,
    }

    // Conta alert attivi
    const alertsCount = await prisma.budgetAlert.groupBy({
      by: ['status'],
      where: { budgetId: budget.id },
      _count: true,
    })

    const alertsCounts = {
      active: alertsCount.find((a) => a.status === 'ACTIVE')?._count || 0,
      acknowledged: alertsCount.find((a) => a.status === 'ACKNOWLEDGED')?._count || 0,
      resolved: alertsCount.find((a) => a.status === 'RESOLVED')?._count || 0,
    }

    return NextResponse.json({
      comparisons,
      summary: {
        ...summary,
        alertsCount: alertsCounts,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/budget/confronto', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo del confronto budget' },
      { status: 500 }
    )
  }
}
