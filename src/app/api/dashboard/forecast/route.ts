import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import {
  addDays,
  subDays,
  subYears,
  startOfDay,
  format,
  getDay,
  getDate,
  getMonth,
  differenceInDays,
} from 'date-fns'
import { it } from 'date-fns/locale'

import { logger } from '@/lib/logger'
interface ForecastDay {
  date: string
  dateFormatted: string
  dayOfWeek: string
  expectedIncome: number
  expectedExpenses: number
  netChange: number
  projectedBalance: number
  isWeekend: boolean
  incomeSource: 'historical' | 'average' | 'hybrid'
  expenses: Array<{ name: string; amount: number }>
}

interface ForecastResult {
  currentBalance: {
    cash: number
    bank: number
    total: number
  }
  forecast: ForecastDay[]
  summary: {
    totalExpectedIncome: number
    totalExpectedExpenses: number
    minBalance: number
    minBalanceDate: string
    maxBalance: number
    maxBalanceDate: string
    daysUntilLowBalance: number | null
    averageDailyIncome: number
  }
  alerts: Array<{
    type: 'LOW_BALANCE' | 'NEGATIVE_BALANCE' | 'HIGH_EXPENSE_DAY'
    date: string
    message: string
    severity: 'warning' | 'critical'
  }>
  settings: {
    lowBalanceThreshold: number
    forecastDays: number
    forecastMethod: string
  }
}

// GET /api/dashboard/forecast - Previsione cash flow
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = await getVenueId()
    const days = parseInt(searchParams.get('days') || '30')

    const forecastDays = Math.min(Math.max(days, 7), 90)
    const today = startOfDay(new Date())

    // Ottieni impostazioni cash flow per la sede
    const settings = await prisma.cashFlowSetting.findUnique({
      where: { venueId },
    })

    const lowBalanceThreshold = settings
      ? Number(settings.lowBalanceThreshold)
      : 5000
    const forecastMethod = settings?.forecastMethod || 'HYBRID'
    const movingAverageDays = settings?.movingAverageDays || 30

    // 1. Calcola saldo attuale
    const currentBalance = await calculateCurrentBalance(venueId)

    // 2. Ottieni dati storici per previsione entrate
    const historicalData = await getHistoricalIncomeData(
      venueId,
      today,
      forecastDays,
      movingAverageDays
    )

    // 3. Ottieni spese ricorrenti
    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: {
        venueId,
        isActive: true,
        OR: [
          { endDate: null },
          { endDate: { gte: today } },
        ],
      },
    })

    // 4. Genera previsione giorno per giorno
    const forecast: ForecastDay[] = []
    let runningBalance = currentBalance.total
    let minBalance = runningBalance
    let minBalanceDate = format(today, 'yyyy-MM-dd')
    let maxBalance = runningBalance
    let maxBalanceDate = format(today, 'yyyy-MM-dd')
    let totalExpectedIncome = 0
    let totalExpectedExpenses = 0

    for (let i = 1; i <= forecastDays; i++) {
      const forecastDate = addDays(today, i)
      const dateStr = format(forecastDate, 'yyyy-MM-dd')
      const dayOfWeek = getDay(forecastDate)
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

      // Calcola entrate previste
      const { income, source } = calculateExpectedIncome(
        forecastDate,
        historicalData,
        forecastMethod
      )

      // Calcola uscite previste per questo giorno
      const { total: expensesTotal, details: expenseDetails } =
        calculateExpectedExpenses(forecastDate, recurringExpenses)

      const netChange = income - expensesTotal
      runningBalance += netChange

      totalExpectedIncome += income
      totalExpectedExpenses += expensesTotal

      // Traccia min/max
      if (runningBalance < minBalance) {
        minBalance = runningBalance
        minBalanceDate = dateStr
      }
      if (runningBalance > maxBalance) {
        maxBalance = runningBalance
        maxBalanceDate = dateStr
      }

      forecast.push({
        date: dateStr,
        dateFormatted: format(forecastDate, 'EEE d MMM', { locale: it }),
        dayOfWeek: format(forecastDate, 'EEEE', { locale: it }),
        expectedIncome: Math.round(income * 100) / 100,
        expectedExpenses: Math.round(expensesTotal * 100) / 100,
        netChange: Math.round(netChange * 100) / 100,
        projectedBalance: Math.round(runningBalance * 100) / 100,
        isWeekend,
        incomeSource: source,
        expenses: expenseDetails,
      })
    }

    // 5. Genera alert
    const alerts: ForecastResult['alerts'] = []

    // Alert saldo sotto soglia
    const lowBalanceDays = forecast.filter(
      (d) => d.projectedBalance < lowBalanceThreshold
    )
    if (lowBalanceDays.length > 0) {
      const firstLowDay = lowBalanceDays[0]
      alerts.push({
        type: 'LOW_BALANCE',
        date: firstLowDay.date,
        message: `Saldo previsto sotto soglia (${lowBalanceThreshold.toLocaleString(
          'it-IT',
          { style: 'currency', currency: 'EUR' }
        )}) dal ${firstLowDay.dateFormatted}`,
        severity: 'warning',
      })
    }

    // Alert saldo negativo
    const negativeDays = forecast.filter((d) => d.projectedBalance < 0)
    if (negativeDays.length > 0) {
      const firstNegativeDay = negativeDays[0]
      alerts.push({
        type: 'NEGATIVE_BALANCE',
        date: firstNegativeDay.date,
        message: `Saldo previsto negativo dal ${firstNegativeDay.dateFormatted}`,
        severity: 'critical',
      })
    }

    // Alert giornate con spese elevate
    const highExpenseDays = forecast.filter((d) => d.expectedExpenses > 2000)
    for (const day of highExpenseDays.slice(0, 3)) {
      alerts.push({
        type: 'HIGH_EXPENSE_DAY',
        date: day.date,
        message: `Spese elevate previste il ${day.dateFormatted}: ${day.expectedExpenses.toLocaleString(
          'it-IT',
          { style: 'currency', currency: 'EUR' }
        )}`,
        severity: 'warning',
      })
    }

    // Calcola giorni fino a saldo basso
    const daysUntilLowBalance = lowBalanceDays.length > 0
      ? differenceInDays(new Date(lowBalanceDays[0].date), today)
      : null

    const result: ForecastResult = {
      currentBalance,
      forecast,
      summary: {
        totalExpectedIncome: Math.round(totalExpectedIncome * 100) / 100,
        totalExpectedExpenses: Math.round(totalExpectedExpenses * 100) / 100,
        minBalance: Math.round(minBalance * 100) / 100,
        minBalanceDate,
        maxBalance: Math.round(maxBalance * 100) / 100,
        maxBalanceDate,
        daysUntilLowBalance,
        averageDailyIncome:
          Math.round((totalExpectedIncome / forecastDays) * 100) / 100,
      },
      alerts,
      settings: {
        lowBalanceThreshold,
        forecastDays,
        forecastMethod,
      },
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Errore GET /api/dashboard/forecast', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo della previsione' },
      { status: 500 }
    )
  }
}

// Calcola saldo attuale da prima nota
async function calculateCurrentBalance(venueId: string) {
  const currentYear = new Date().getFullYear()

  // Saldo iniziale
  const initialBalance = await prisma.initialBalance.findUnique({
    where: {
      venueId_year: { venueId, year: currentYear },
    },
  })

  const cashOpening = initialBalance ? Number(initialBalance.cashBalance) : 0
  const bankOpening = initialBalance ? Number(initialBalance.bankBalance) : 0

  // Movimenti da inizio anno
  const [cashAgg, bankAgg] = await Promise.all([
    prisma.journalEntry.aggregate({
      where: { venueId, registerType: 'CASH' },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    prisma.journalEntry.aggregate({
      where: { venueId, registerType: 'BANK' },
      _sum: { debitAmount: true, creditAmount: true },
    }),
  ])

  const cashBalance =
    cashOpening +
    Number(cashAgg._sum.debitAmount || 0) -
    Number(cashAgg._sum.creditAmount || 0)

  const bankBalance =
    bankOpening +
    Number(bankAgg._sum.debitAmount || 0) -
    Number(bankAgg._sum.creditAmount || 0)

  return {
    cash: Math.round(cashBalance * 100) / 100,
    bank: Math.round(bankBalance * 100) / 100,
    total: Math.round((cashBalance + bankBalance) * 100) / 100,
  }
}

// Ottieni dati storici per previsione
async function getHistoricalIncomeData(
  venueId: string,
  today: Date,
  forecastDays: number,
  movingAverageDays: number
) {
  // Dati anno scorso (stesso periodo)
  const lastYearStart = subYears(today, 1)
  const lastYearEnd = addDays(subYears(today, 1), forecastDays)

  const lastYearClosures = await prisma.dailyClosure.findMany({
    where: {
      venueId,
      status: 'VALIDATED',
      date: {
        gte: lastYearStart,
        lte: lastYearEnd,
      },
    },
    include: {
      stations: {
        select: { cashAmount: true, posAmount: true },
      },
    },
  })

  // Media mobile ultimi N giorni
  const movingAvgStart = subDays(today, movingAverageDays)
  const recentClosures = await prisma.dailyClosure.findMany({
    where: {
      venueId,
      status: 'VALIDATED',
      date: {
        gte: movingAvgStart,
        lt: today,
      },
    },
    include: {
      stations: {
        select: { cashAmount: true, posAmount: true },
      },
    },
  })

  // Calcola incasso per giorno della settimana (media)
  const dayOfWeekAverages: Record<number, { total: number; count: number }> = {}
  for (let i = 0; i < 7; i++) {
    dayOfWeekAverages[i] = { total: 0, count: 0 }
  }

  for (const closure of recentClosures) {
    const income = closure.stations.reduce(
      (sum, s) =>
        sum + (Number(s.cashAmount) || 0) + (Number(s.posAmount) || 0),
      0
    )
    const dow = getDay(new Date(closure.date))
    dayOfWeekAverages[dow].total += income
    dayOfWeekAverages[dow].count++
  }

  // Mappa storico anno scorso per data
  const historicalByDate: Record<string, number> = {}
  for (const closure of lastYearClosures) {
    const income = closure.stations.reduce(
      (sum, s) =>
        sum + (Number(s.cashAmount) || 0) + (Number(s.posAmount) || 0),
      0
    )
    // Usa mese-giorno come chiave per matching anno corrente
    const monthDay = format(new Date(closure.date), 'MM-dd')
    historicalByDate[monthDay] = income
  }

  return {
    dayOfWeekAverages,
    historicalByDate,
    overallAverage:
      recentClosures.length > 0
        ? recentClosures.reduce(
            (sum, c) =>
              sum +
              c.stations.reduce(
                (s, st) =>
                  s + (Number(st.cashAmount) || 0) + (Number(st.posAmount) || 0),
                0
              ),
            0
          ) / recentClosures.length
        : 0,
  }
}

// Calcola entrate previste per un giorno
function calculateExpectedIncome(
  date: Date,
  historicalData: Awaited<ReturnType<typeof getHistoricalIncomeData>>,
  method: string
): { income: number; source: 'historical' | 'average' | 'hybrid' } {
  const monthDay = format(date, 'MM-dd')
  const dayOfWeek = getDay(date)
  const _isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  const historicalIncome = historicalData.historicalByDate[monthDay]
  const dowData = historicalData.dayOfWeekAverages[dayOfWeek]
  const dowAverage = dowData.count > 0 ? dowData.total / dowData.count : 0

  // Domenica tipicamente chiuso o incasso molto basso
  if (dayOfWeek === 0) {
    return { income: 0, source: 'average' }
  }

  switch (method) {
    case 'HISTORICAL':
      if (historicalIncome !== undefined) {
        return { income: historicalIncome, source: 'historical' }
      }
      return { income: dowAverage || historicalData.overallAverage, source: 'average' }

    case 'MOVING_AVERAGE':
      return { income: dowAverage || historicalData.overallAverage, source: 'average' }

    case 'HYBRID':
    default:
      if (historicalIncome !== undefined && dowAverage > 0) {
        // Media ponderata: 60% storico, 40% media recente
        const hybridIncome = historicalIncome * 0.6 + dowAverage * 0.4
        return { income: hybridIncome, source: 'hybrid' }
      }
      if (historicalIncome !== undefined) {
        return { income: historicalIncome, source: 'historical' }
      }
      return { income: dowAverage || historicalData.overallAverage, source: 'average' }
  }
}

// Calcola spese previste per un giorno
function calculateExpectedExpenses(
  date: Date,
  recurringExpenses: Array<{
    id: string
    name: string
    amount: { toNumber(): number } | number | string
    frequency: string
    dayOfMonth: number | null
    dayOfWeek: number | null
    startDate: Date | null
    endDate: Date | null
  }>
): { total: number; details: Array<{ name: string; amount: number }> } {
  const details: Array<{ name: string; amount: number }> = []
  let total = 0

  const dayOfMonth = getDate(date)
  const dayOfWeek = getDay(date)
  const month = getMonth(date)

  for (const expense of recurringExpenses) {
    // Verifica date validità
    if (expense.startDate && date < expense.startDate) continue
    if (expense.endDate && date > expense.endDate) continue

    const amount = Number(expense.amount)
    let applies = false

    switch (expense.frequency) {
      case 'DAILY':
        applies = true
        break

      case 'WEEKLY':
        applies = expense.dayOfWeek === dayOfWeek
        break

      case 'BIWEEKLY':
        // Ogni due settimane - semplificato: 1° e 15° del mese
        applies =
          expense.dayOfWeek === dayOfWeek &&
          (dayOfMonth <= 7 || (dayOfMonth >= 15 && dayOfMonth <= 21))
        break

      case 'MONTHLY':
        applies = expense.dayOfMonth === dayOfMonth
        break

      case 'QUARTERLY':
        // Trimestrale: mesi 0,3,6,9 (gen,apr,lug,ott)
        applies =
          expense.dayOfMonth === dayOfMonth && [0, 3, 6, 9].includes(month)
        break

      case 'YEARLY':
        // Annuale: verifica mese e giorno
        applies = expense.dayOfMonth === dayOfMonth && month === 0 // Gennaio
        break
    }

    if (applies) {
      details.push({ name: expense.name, amount })
      total += amount
    }
  }

  return { total, details }
}
