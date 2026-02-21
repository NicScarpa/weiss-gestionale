import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { updateBudgetSchema } from '@/lib/validations/budget'

import { logger } from '@/lib/logger'
// GET /api/budget/[id] - Dettaglio budget con righe
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const budget = await prisma.budget.findUnique({
      where: { id },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
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
          orderBy: {
            account: {
              code: 'asc',
            },
          },
        },
        alerts: {
          where: {
            status: 'ACTIVE',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
      },
    })

    if (!budget) {
      return NextResponse.json({ error: 'Budget non trovato' }, { status: 404 })
    }

    // Formatta le righe con valori numerici
    const formattedLines = budget.lines.map((line) => ({
      id: line.id,
      budgetId: line.budgetId,
      accountId: line.accountId,
      jan: Number(line.jan),
      feb: Number(line.feb),
      mar: Number(line.mar),
      apr: Number(line.apr),
      may: Number(line.may),
      jun: Number(line.jun),
      jul: Number(line.jul),
      aug: Number(line.aug),
      sep: Number(line.sep),
      oct: Number(line.oct),
      nov: Number(line.nov),
      dec: Number(line.dec),
      annualTotal: Number(line.annualTotal),
      notes: line.notes,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
      account: line.account,
    }))

    // Formatta gli alert
    const formattedAlerts = budget.alerts.map((alert) => ({
      id: alert.id,
      budgetId: alert.budgetId,
      accountId: alert.accountId,
      month: alert.month,
      alertType: alert.alertType,
      budgetAmount: Number(alert.budgetAmount),
      actualAmount: Number(alert.actualAmount),
      varianceAmount: Number(alert.varianceAmount),
      variancePercent: Number(alert.variancePercent),
      status: alert.status,
      message: alert.message,
      createdAt: alert.createdAt,
    }))

    // Calcola totale budget
    const totalBudget = formattedLines.reduce((sum, line) => sum + line.annualTotal, 0)

    return NextResponse.json({
      id: budget.id,
      venueId: budget.venueId,
      year: budget.year,
      name: budget.name,
      status: budget.status,
      notes: budget.notes,
      createdById: budget.createdById,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
      venue: budget.venue,
      createdBy: budget.createdBy,
      lines: formattedLines,
      alerts: formattedAlerts,
      totalBudget,
      lineCount: formattedLines.length,
    })
  } catch (error) {
    logger.error('Errore GET /api/budget/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del budget' },
      { status: 500 }
    )
  }
}

// PUT /api/budget/[id] - Aggiorna budget
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin o manager possono modificare budget
    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Non hai i permessi per modificare budget' },
        { status: 403 }
      )
    }

    // Verifica esistenza
    const existing = await prisma.budget.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Budget non trovato' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateBudgetSchema.parse(body)

    // Aggiorna il budget
    const budget = await prisma.budget.update({
      where: { id },
      data: {
        name: validatedData.name,
        status: validatedData.status,
        notes: validatedData.notes,
      },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    return NextResponse.json(budget)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/budget/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del budget' },
      { status: 500 }
    )
  }
}

// DELETE /api/budget/[id] - Elimina budget (solo DRAFT)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può eliminare budget
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo gli amministratori possono eliminare budget' },
        { status: 403 }
      )
    }

    // Verifica esistenza
    const existing = await prisma.budget.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Budget non trovato' }, { status: 404 })
    }

    // Solo budget in DRAFT possono essere eliminati
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Solo i budget in bozza possono essere eliminati' },
        { status: 400 }
      )
    }

    // Elimina il budget (le righe e gli alert vengono eliminati in cascade)
    await prisma.budget.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/budget/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del budget' },
      { status: 500 }
    )
  }
}
