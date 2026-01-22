import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
const updateExpenseSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  amount: z.number().positive().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  dayOfMonth: z.number().min(1).max(31).optional().nullable(),
  dayOfWeek: z.number().min(0).max(6).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/recurring-expenses/[id] - Dettaglio spesa
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const expense = await prisma.recurringExpense.findUnique({
      where: { id },
      include: {
        account: {
          select: { id: true, code: true, name: true },
        },
        venue: {
          select: { id: true, name: true, code: true },
        },
      },
    })

    if (!expense) {
      return NextResponse.json(
        { error: 'Spesa non trovata' },
        { status: 404 }
      )
    }

    // Verifica accesso
    if (
      session.user.role !== 'admin' &&
      session.user.venueId !== expense.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    return NextResponse.json(expense)
  } catch (error) {
    logger.error('Errore GET /api/recurring-expenses/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della spesa' },
      { status: 500 }
    )
  }
}

// PUT /api/recurring-expenses/[id] - Aggiorna spesa
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const expense = await prisma.recurringExpense.findUnique({
      where: { id },
    })

    if (!expense) {
      return NextResponse.json(
        { error: 'Spesa non trovata' },
        { status: 404 }
      )
    }

    // Verifica accesso sede
    if (
      session.user.role !== 'admin' &&
      session.user.venueId !== expense.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = updateExpenseSchema.parse(body)

    const updated = await prisma.recurringExpense.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.description !== undefined && {
          description: validatedData.description,
        }),
        ...(validatedData.amount && { amount: validatedData.amount }),
        ...(validatedData.frequency && { frequency: validatedData.frequency }),
        ...(validatedData.dayOfMonth !== undefined && {
          dayOfMonth: validatedData.dayOfMonth,
        }),
        ...(validatedData.dayOfWeek !== undefined && {
          dayOfWeek: validatedData.dayOfWeek,
        }),
        ...(validatedData.startDate !== undefined && {
          startDate: validatedData.startDate
            ? new Date(validatedData.startDate)
            : null,
        }),
        ...(validatedData.endDate !== undefined && {
          endDate: validatedData.endDate
            ? new Date(validatedData.endDate)
            : null,
        }),
        ...(validatedData.accountId !== undefined && {
          accountId: validatedData.accountId,
        }),
        ...(validatedData.category !== undefined && {
          category: validatedData.category,
        }),
        ...(validatedData.isActive !== undefined && {
          isActive: validatedData.isActive,
        }),
      },
      include: {
        account: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/recurring-expenses/[id]', error)
    return NextResponse.json(
      { error: "Errore nell'aggiornamento della spesa" },
      { status: 500 }
    )
  }
}

// DELETE /api/recurring-expenses/[id] - Elimina spesa
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const expense = await prisma.recurringExpense.findUnique({
      where: { id },
    })

    if (!expense) {
      return NextResponse.json(
        { error: 'Spesa non trovata' },
        { status: 404 }
      )
    }

    // Verifica accesso sede
    if (
      session.user.role !== 'admin' &&
      session.user.venueId !== expense.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    await prisma.recurringExpense.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/recurring-expenses/[id]', error)
    return NextResponse.json(
      { error: "Errore nell'eliminazione della spesa" },
      { status: 500 }
    )
  }
}
