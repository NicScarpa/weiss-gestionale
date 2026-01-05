// Alert Generator - Genera alert automatici quando i budget superano le soglie
import { prisma } from '@/lib/prisma'
import { aggregateCategoriesForBudget, type CategoryData } from './category-aggregator'

interface AlertGeneratorResult {
  budgetId: string
  alertsCreated: number
  alertsResolved: number
  categories: Array<{
    categoryId: string
    categoryName: string
    status: 'ok' | 'warning' | 'alert'
    percentOfRevenue: number
    benchmark: number | null
  }>
}

/**
 * Genera alert per un budget basandosi sui benchmark delle categorie
 */
export async function generateBudgetAlerts(
  budgetId: string
): Promise<AlertGeneratorResult> {
  // 1. Recupera budget info
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { id: true, venueId: true, year: true, status: true },
  })

  if (!budget) {
    throw new Error('Budget non trovato')
  }

  // 2. Aggrega dati per categoria
  const aggregation = await aggregateCategoriesForBudget(
    budget.id,
    budget.venueId,
    budget.year
  )

  // 3. Funzione ricorsiva per processare categorie
  const processCategory = async (category: CategoryData): Promise<{
    created: number
    resolved: number
    info: AlertGeneratorResult['categories'][0]
  }> => {
    let created = 0
    let resolved = 0

    const info = {
      categoryId: category.id,
      categoryName: category.name,
      status: category.status,
      percentOfRevenue: category.percentOfRevenue.annual,
      benchmark: category.benchmarkPercentage,
    }

    // Controlla se esiste gia un alert attivo per questa categoria
    const existingAlert = await prisma.budgetAlert.findFirst({
      where: {
        budgetId,
        categoryId: category.id,
        status: 'ACTIVE',
      },
    })

    if (category.status === 'alert' && category.benchmarkPercentage !== null) {
      // Dovrebbe esserci un alert
      if (!existingAlert) {
        // Crea nuovo alert
        const variancePercent = category.percentOfRevenue.annual - category.benchmarkPercentage

        await prisma.budgetAlert.create({
          data: {
            budgetId,
            categoryId: category.id,
            alertType: category.categoryType === 'REVENUE' ? 'UNDER_REVENUE' : 'OVER_BUDGET',
            budgetAmount: category.budget.annual,
            actualAmount: category.actual.annual,
            varianceAmount: category.variance.annual,
            variancePercent,
            status: 'ACTIVE',
            message: `${category.name}: ${category.percentOfRevenue.annual.toFixed(1)}% sui ricavi (benchmark: ${category.benchmarkPercentage}%)`,
          },
        })
        created++
      }
    } else if (category.status === 'ok' && existingAlert) {
      // L'alert non e' piu' necessario, risolvilo
      await prisma.budgetAlert.update({
        where: { id: existingAlert.id },
        data: { status: 'RESOLVED' },
      })
      resolved++
    }

    // Processa figli
    let childCreated = 0
    let childResolved = 0
    for (const child of category.children) {
      const result = await processCategory(child)
      childCreated += result.created
      childResolved += result.resolved
    }

    return {
      created: created + childCreated,
      resolved: resolved + childResolved,
      info,
    }
  }

  // 4. Processa tutte le categorie
  let totalCreated = 0
  let totalResolved = 0
  const categoryInfos: AlertGeneratorResult['categories'] = []

  for (const category of aggregation.categories) {
    const result = await processCategory(category)
    totalCreated += result.created
    totalResolved += result.resolved
    categoryInfos.push(result.info)
  }

  return {
    budgetId,
    alertsCreated: totalCreated,
    alertsResolved: totalResolved,
    categories: categoryInfos,
  }
}

/**
 * Genera alert per tutti i budget attivi di una venue
 */
export async function generateAlertsForVenue(venueId: string): Promise<{
  budgetsProcessed: number
  totalAlertsCreated: number
  totalAlertsResolved: number
}> {
  // Trova budget attivi
  const budgets = await prisma.budget.findMany({
    where: {
      venueId,
      status: 'ACTIVE',
    },
    select: { id: true },
  })

  let totalCreated = 0
  let totalResolved = 0

  for (const budget of budgets) {
    const result = await generateBudgetAlerts(budget.id)
    totalCreated += result.alertsCreated
    totalResolved += result.alertsResolved
  }

  return {
    budgetsProcessed: budgets.length,
    totalAlertsCreated: totalCreated,
    totalAlertsResolved: totalResolved,
  }
}

/**
 * Genera alert per tutti i budget attivi (per cron job)
 */
export async function generateAlertsForAllActiveBudgets(): Promise<{
  budgetsProcessed: number
  totalAlertsCreated: number
  totalAlertsResolved: number
}> {
  // Trova tutti i budget attivi
  const budgets = await prisma.budget.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  let totalCreated = 0
  let totalResolved = 0

  for (const budget of budgets) {
    try {
      const result = await generateBudgetAlerts(budget.id)
      totalCreated += result.alertsCreated
      totalResolved += result.alertsResolved
    } catch (error) {
      console.error(`Errore generazione alert per budget ${budget.id}:`, error)
    }
  }

  return {
    budgetsProcessed: budgets.length,
    totalAlertsCreated: totalCreated,
    totalAlertsResolved: totalResolved,
  }
}
