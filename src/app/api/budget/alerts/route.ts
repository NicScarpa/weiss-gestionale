import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { alertFiltersSchema, acknowledgeAlertSchema } from '@/lib/validations/budget'
import {
  BUDGET_VARIANCE_THRESHOLD,
  MONTH_LABELS_FULL,
  type MonthKey,
} from '@/types/budget'
import { monthNumberToKey } from '@/lib/budget-utils'

// GET /api/budget/alerts - Lista alert budget
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Parse filtri
    const filters = alertFiltersSchema.parse({
      venueId: searchParams.get('venueId') || undefined,
      year: searchParams.get('year') || undefined,
      status: searchParams.get('status') || undefined,
      alertType: searchParams.get('alertType') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    })

    // Costruisci where clause
    const where: any = {}

    // Filtra per sede attraverso il budget
    const budgetWhere: any = {}
    if (session.user.role !== 'admin') {
      budgetWhere.venueId = session.user.venueId
    } else if (filters.venueId) {
      budgetWhere.venueId = filters.venueId
    }

    if (filters.year) {
      budgetWhere.year = filters.year
    }

    if (Object.keys(budgetWhere).length > 0) {
      where.budget = budgetWhere
    }

    if (filters.status) {
      where.status = filters.status
    }

    if (filters.alertType) {
      where.alertType = filters.alertType
    }

    // Query con paginazione
    const [alerts, total] = await Promise.all([
      prisma.budgetAlert.findMany({
        where,
        include: {
          budget: {
            select: {
              id: true,
              year: true,
              name: true,
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
        orderBy: [
          { status: 'asc' }, // ACTIVE first
          { createdAt: 'desc' },
        ],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.budgetAlert.count({ where }),
    ])

    // Formatta gli alert
    const formattedAlerts = alerts.map((alert) => {
      const monthLabel = alert.month
        ? MONTH_LABELS_FULL[monthNumberToKey(alert.month)]
        : 'Annuale'

      return {
        id: alert.id,
        budgetId: alert.budgetId,
        accountId: alert.accountId,
        month: alert.month,
        monthLabel,
        alertType: alert.alertType,
        budgetAmount: Number(alert.budgetAmount),
        actualAmount: Number(alert.actualAmount),
        varianceAmount: Number(alert.varianceAmount),
        variancePercent: Number(alert.variancePercent),
        status: alert.status,
        acknowledgedBy: alert.acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt,
        message: alert.message,
        createdAt: alert.createdAt,
        budget: alert.budget,
      }
    })

    return NextResponse.json({
      data: formattedAlerts,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore GET /api/budget/alerts:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero degli alert' },
      { status: 500 }
    )
  }
}

// POST /api/budget/alerts - Prendi visione di un alert
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const { alertId } = acknowledgeAlertSchema.parse(body)

    // Verifica esistenza alert
    const alert = await prisma.budgetAlert.findUnique({
      where: { id: alertId },
      include: {
        budget: {
          select: { venueId: true },
        },
      },
    })

    if (!alert) {
      return NextResponse.json({ error: 'Alert non trovato' }, { status: 404 })
    }

    // Verifica accesso sede
    if (session.user.role !== 'admin' && alert.budget.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Aggiorna lo stato dell'alert
    const updatedAlert = await prisma.budgetAlert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedBy: session.user.id,
        acknowledgedAt: new Date(),
      },
    })

    return NextResponse.json({
      id: updatedAlert.id,
      status: updatedAlert.status,
      acknowledgedBy: updatedAlert.acknowledgedBy,
      acknowledgedAt: updatedAlert.acknowledgedAt,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/budget/alerts:', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento dell\'alert' },
      { status: 500 }
    )
  }
}
