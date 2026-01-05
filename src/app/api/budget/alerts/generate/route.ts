import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  generateBudgetAlerts,
  generateAlertsForVenue,
  generateAlertsForAllActiveBudgets,
} from '@/lib/budget/alert-generator'

/**
 * POST /api/budget/alerts/generate
 * Genera alert per budget che superano le soglie benchmark
 *
 * Body:
 * - budgetId?: string - Genera alert per un budget specifico
 * - venueId?: string - Genera alert per tutti i budget attivi di una venue
 * - all?: boolean - Genera alert per tutti i budget attivi (per cron job)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const { budgetId, venueId, all } = body

    // Validazione: almeno un parametro deve essere fornito
    if (!budgetId && !venueId && !all) {
      return NextResponse.json(
        { error: 'Specificare budgetId, venueId o all=true' },
        { status: 400 }
      )
    }

    let result

    if (budgetId) {
      // Genera alert per un budget specifico
      result = await generateBudgetAlerts(budgetId)
      return NextResponse.json({
        success: true,
        mode: 'single_budget',
        budgetId,
        alertsCreated: result.alertsCreated,
        alertsResolved: result.alertsResolved,
        categories: result.categories,
      })
    }

    if (venueId) {
      // Genera alert per tutti i budget attivi di una venue
      result = await generateAlertsForVenue(venueId)
      return NextResponse.json({
        success: true,
        mode: 'venue',
        venueId,
        budgetsProcessed: result.budgetsProcessed,
        totalAlertsCreated: result.totalAlertsCreated,
        totalAlertsResolved: result.totalAlertsResolved,
      })
    }

    if (all) {
      // Genera alert per tutti i budget attivi (per cron job)
      result = await generateAlertsForAllActiveBudgets()
      return NextResponse.json({
        success: true,
        mode: 'all',
        budgetsProcessed: result.budgetsProcessed,
        totalAlertsCreated: result.totalAlertsCreated,
        totalAlertsResolved: result.totalAlertsResolved,
      })
    }

    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
  } catch (error) {
    console.error('Errore generazione alert:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore interno' },
      { status: 500 }
    )
  }
}
