// Category Aggregator - Logica per aggregare budget/actual per categoria
import { prisma } from '@/lib/prisma'
import {
  type MonthlyValues,
  type MonthKey,
  MONTH_KEYS,
  MONTH_NUMBER_TO_KEY,
} from '@/types/budget'
import {
  emptyMonthlyValues,
  calculateAnnualTotal,
  budgetLineToMonthlyValues,
} from '@/lib/budget-utils'

export type CategoryType = 'REVENUE' | 'COST' | 'KPI' | 'TAX' | 'INVESTMENT' | 'VAT'

export interface CategoryData {
  id: string
  code: string
  name: string
  categoryType: CategoryType
  benchmarkPercentage: number | null
  alertThresholdPercent: number
  color: string | null
  icon: string | null
  level: number
  parentId: string | null
  displayOrder: number
  budget: MonthlyValues & { annual: number }
  actual: MonthlyValues & { annual: number }
  variance: MonthlyValues & { annual: number }
  percentOfRevenue: MonthlyValues & { annual: number }
  status: 'ok' | 'warning' | 'alert'
  children: CategoryData[]
}

export interface BudgetKPIs {
  targetRevenue: MonthlyValues & { annual: number }
  totalRevenue: MonthlyValues & { annual: number }
  totalCosts: MonthlyValues & { annual: number }
  profit: MonthlyValues & { annual: number }
  profitMargin: MonthlyValues & { annual: number }
  liquidity: number
}

export interface CategoryAggregationResult {
  budgetId: string
  year: number
  venue: { id: string; name: string; code: string }
  kpis: BudgetKPIs
  categories: CategoryData[]
}

/**
 * Recupera i target mensili per una venue/anno
 */
export async function getMonthlyTargets(
  venueId: string,
  year: number
): Promise<MonthlyValues & { annual: number }> {
  const targets = await prisma.budgetTarget.findMany({
    where: { venueId, year },
  })

  const monthlyValues = emptyMonthlyValues()

  for (const target of targets) {
    const monthKey = MONTH_NUMBER_TO_KEY[target.month]
    if (monthKey) {
      monthlyValues[monthKey] = Number(target.targetRevenue)
    }
  }

  return {
    ...monthlyValues,
    annual: calculateAnnualTotal(monthlyValues),
  }
}

/**
 * Recupera i ricavi actual dalle chiusure validate
 */
async function getActualRevenue(
  venueId: string,
  year: number
): Promise<MonthlyValues> {
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31, 23, 59, 59)

  const closures = await prisma.dailyClosure.findMany({
    where: {
      venueId,
      status: 'VALIDATED',
      date: { gte: yearStart, lte: yearEnd },
    },
    select: {
      date: true,
      stations: {
        select: { receiptAmount: true, invoiceAmount: true },
      },
    },
  })

  const monthlyValues = emptyMonthlyValues()

  for (const closure of closures) {
    const month = new Date(closure.date).getMonth() + 1
    const monthKey = MONTH_NUMBER_TO_KEY[month]
    const total = closure.stations.reduce(
      (sum, s) => sum + Number(s.receiptAmount) + Number(s.invoiceAmount),
      0
    )
    monthlyValues[monthKey] += total
  }

  return monthlyValues
}

/**
 * Recupera i costi actual per account dalle spese delle chiusure validate
 */
async function getActualCostsByAccount(
  venueId: string,
  year: number
): Promise<Record<string, MonthlyValues>> {
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31, 23, 59, 59)

  const expenses = await prisma.dailyExpense.findMany({
    where: {
      closure: {
        venueId,
        status: 'VALIDATED',
        date: { gte: yearStart, lte: yearEnd },
      },
    },
    select: {
      amount: true,
      accountId: true,
      closure: { select: { date: true } },
    },
  })

  const byAccount: Record<string, MonthlyValues> = {}

  for (const expense of expenses) {
    if (!expense.accountId) continue

    if (!byAccount[expense.accountId]) {
      byAccount[expense.accountId] = emptyMonthlyValues()
    }

    const month = new Date(expense.closure.date).getMonth() + 1
    const monthKey = MONTH_NUMBER_TO_KEY[month]
    byAccount[expense.accountId][monthKey] += Number(expense.amount)
  }

  return byAccount
}

/**
 * Recupera i budget per account dalle BudgetLine
 */
async function getBudgetByAccount(
  budgetId: string
): Promise<Record<string, MonthlyValues>> {
  const lines = await prisma.budgetLine.findMany({
    where: { budgetId },
    select: {
      accountId: true,
      jan: true,
      feb: true,
      mar: true,
      apr: true,
      may: true,
      jun: true,
      jul: true,
      aug: true,
      sep: true,
      oct: true,
      nov: true,
      dec: true,
    },
  })

  const byAccount: Record<string, MonthlyValues> = {}

  for (const line of lines) {
    byAccount[line.accountId] = budgetLineToMonthlyValues(line)
  }

  return byAccount
}

/**
 * Recupera il saldo liquidita (cassa + banca) dalla Prima Nota
 */
async function getLiquidity(venueId: string): Promise<number> {
  // Somma tutti i movimenti di CASH e BANK
  const result = await prisma.journalEntry.aggregate({
    where: {
      venueId,
      registerType: { in: ['CASH', 'BANK'] },
    },
    _sum: {
      debitAmount: true,
      creditAmount: true,
    },
  })

  const totalDebit = Number(result._sum?.debitAmount) || 0
  const totalCredit = Number(result._sum?.creditAmount) || 0

  // Saldo = Debiti - Crediti (per registri patrimoniali attivi)
  return totalDebit - totalCredit
}

/**
 * Somma due MonthlyValues
 */
function addMonthlyValues(a: MonthlyValues, b: MonthlyValues): MonthlyValues {
  const result = emptyMonthlyValues()
  for (const key of MONTH_KEYS) {
    result[key] = (a[key] || 0) + (b[key] || 0)
  }
  return result
}

/**
 * Sottrae due MonthlyValues (a - b)
 */
function subtractMonthlyValues(a: MonthlyValues, b: MonthlyValues): MonthlyValues {
  const result = emptyMonthlyValues()
  for (const key of MONTH_KEYS) {
    result[key] = (a[key] || 0) - (b[key] || 0)
  }
  return result
}

/**
 * Calcola percentuale di MonthlyValues rispetto a totale
 */
function calculatePercentOfTotal(
  values: MonthlyValues,
  totals: MonthlyValues
): MonthlyValues {
  const result = emptyMonthlyValues()
  for (const key of MONTH_KEYS) {
    const total = totals[key] || 0
    result[key] = total > 0 ? (values[key] / total) * 100 : 0
  }
  return result
}

/**
 * Determina lo status basato su benchmark
 */
function determineStatus(
  percentOfRevenue: number,
  benchmarkPercentage: number | null,
  alertThreshold: number,
  categoryType: CategoryType
): 'ok' | 'warning' | 'alert' {
  if (benchmarkPercentage === null) return 'ok'

  const diff = percentOfRevenue - benchmarkPercentage

  // Per COST: superare benchmark e' negativo
  // Per REVENUE: essere sotto benchmark e' negativo
  const isNegative =
    categoryType === 'COST' || categoryType === 'TAX' || categoryType === 'INVESTMENT'
      ? diff > 0
      : diff < 0

  if (!isNegative) return 'ok'

  const absDiff = Math.abs(diff)

  if (absDiff >= alertThreshold) return 'alert'
  if (absDiff >= alertThreshold / 2) return 'warning'
  return 'ok'
}

/**
 * Aggrega ricorsivamente le categorie con budget e actual
 */
export async function aggregateCategoriesForBudget(
  budgetId: string,
  venueId: string,
  year: number
): Promise<CategoryAggregationResult> {
  // 1. Recupera venue
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, code: true },
  })

  if (!venue) {
    throw new Error('Venue non trovata')
  }

  // 2. Recupera tutte le categorie con mapping
  const categories = await prisma.budgetCategory.findMany({
    where: { venueId, isActive: true },
    include: {
      accountMappings: {
        where: { includeInBudget: true },
        select: { accountId: true },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  })

  // 3. Recupera dati budget e actual
  const [budgetByAccount, actualCostsByAccount, actualRevenue, targets, liquidity] =
    await Promise.all([
      getBudgetByAccount(budgetId),
      getActualCostsByAccount(venueId, year),
      getActualRevenue(venueId, year),
      getMonthlyTargets(venueId, year),
      getLiquidity(venueId),
    ])

  // 4. Calcola totali per KPI
  const totalRevenueValues = actualRevenue
  const totalRevenueAnnual = calculateAnnualTotal(totalRevenueValues)

  let totalCostsValues = emptyMonthlyValues()
  for (const accountId in actualCostsByAccount) {
    totalCostsValues = addMonthlyValues(
      totalCostsValues,
      actualCostsByAccount[accountId]
    )
  }
  const totalCostsAnnual = calculateAnnualTotal(totalCostsValues)

  const profitValues = subtractMonthlyValues(totalRevenueValues, totalCostsValues)
  const profitAnnual = totalRevenueAnnual - totalCostsAnnual

  // Profit margin per mese
  const profitMarginValues = emptyMonthlyValues()
  for (const key of MONTH_KEYS) {
    const revenue = totalRevenueValues[key] || 0
    profitMarginValues[key] = revenue > 0 ? (profitValues[key] / revenue) * 100 : 0
  }
  const profitMarginAnnual =
    totalRevenueAnnual > 0 ? (profitAnnual / totalRevenueAnnual) * 100 : 0

  // 5. Costruisci gerarchia categorie con dati aggregati
  const categoryMap = new Map<string, CategoryData>()

  // Prima passata: calcola valori per ogni categoria (dai suoi account mappati)
  for (const cat of categories) {
    let budgetValues = emptyMonthlyValues()
    let actualValues = emptyMonthlyValues()

    for (const mapping of cat.accountMappings) {
      const accountBudget = budgetByAccount[mapping.accountId]
      if (accountBudget) {
        budgetValues = addMonthlyValues(budgetValues, accountBudget)
      }

      // Per i ricavi usa totalRevenue, per i costi usa per-account
      if (cat.categoryType === 'REVENUE') {
        // I ricavi sono un totale aggregato, non per-account
        // Si assume che la categoria REVENUE mappi ai conti ricavo
        actualValues = totalRevenueValues
      } else {
        const accountActual = actualCostsByAccount[mapping.accountId]
        if (accountActual) {
          actualValues = addMonthlyValues(actualValues, accountActual)
        }
      }
    }

    const budgetAnnual = calculateAnnualTotal(budgetValues)
    const actualAnnual = calculateAnnualTotal(actualValues)

    const varianceValues = subtractMonthlyValues(actualValues, budgetValues)
    const varianceAnnual = actualAnnual - budgetAnnual

    const percentOfRevenueValues = calculatePercentOfTotal(
      actualValues,
      totalRevenueValues
    )
    const percentOfRevenueAnnual =
      totalRevenueAnnual > 0 ? (actualAnnual / totalRevenueAnnual) * 100 : 0

    const status = determineStatus(
      percentOfRevenueAnnual,
      cat.benchmarkPercentage ? Number(cat.benchmarkPercentage) : null,
      cat.alertThresholdPercent ? Number(cat.alertThresholdPercent) : 10,
      cat.categoryType as CategoryType
    )

    categoryMap.set(cat.id, {
      id: cat.id,
      code: cat.code,
      name: cat.name,
      categoryType: cat.categoryType as CategoryType,
      benchmarkPercentage: cat.benchmarkPercentage
        ? Number(cat.benchmarkPercentage)
        : null,
      alertThresholdPercent: cat.alertThresholdPercent
        ? Number(cat.alertThresholdPercent)
        : 10,
      color: cat.color,
      icon: cat.icon,
      level: cat.parentId ? 1 : 0,
      parentId: cat.parentId,
      displayOrder: cat.displayOrder,
      budget: { ...budgetValues, annual: budgetAnnual },
      actual: { ...actualValues, annual: actualAnnual },
      variance: { ...varianceValues, annual: varianceAnnual },
      percentOfRevenue: { ...percentOfRevenueValues, annual: percentOfRevenueAnnual },
      status,
      children: [],
    })
  }

  // Seconda passata: costruisci gerarchia
  const rootCategories: CategoryData[] = []

  for (const cat of categories) {
    const categoryData = categoryMap.get(cat.id)!

    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId)
      if (parent) {
        parent.children.push(categoryData)
        categoryData.level = parent.level + 1
      }
    } else {
      rootCategories.push(categoryData)
    }
  }

  // Ordina children per displayOrder
  for (const cat of categoryMap.values()) {
    cat.children.sort((a, b) => a.displayOrder - b.displayOrder)
  }

  // 6. Costruisci risultato
  return {
    budgetId,
    year,
    venue,
    kpis: {
      targetRevenue: targets,
      totalRevenue: { ...totalRevenueValues, annual: totalRevenueAnnual },
      totalCosts: { ...totalCostsValues, annual: totalCostsAnnual },
      profit: { ...profitValues, annual: profitAnnual },
      profitMargin: { ...profitMarginValues, annual: profitMarginAnnual },
      liquidity,
    },
    categories: rootCategories,
  }
}
