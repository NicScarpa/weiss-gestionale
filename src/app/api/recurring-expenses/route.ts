import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
const createExpenseSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  description: z.string().optional(),
  amount: z.number().positive('Importo deve essere positivo'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  dayOfMonth: z.number().min(1).max(31).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().optional(),
  category: z.string().optional(),
})

// GET /api/recurring-expenses - Lista spese ricorrenti
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId') || session.user.venueId
    const includeInactive = searchParams.get('includeInactive') === 'true'

    if (!venueId) {
      return NextResponse.json(
        { error: 'Sede non specificata' },
        { status: 400 }
      )
    }

    // Verifica accesso
    if (session.user.role !== 'admin' && session.user.venueId !== venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const expenses = await prisma.recurringExpense.findMany({
      where: {
        venueId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        account: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    })

    // Calcola totali per frequenza
    const totals = {
      monthly: 0,
      yearly: 0,
    }

    for (const expense of expenses) {
      if (!expense.isActive) continue
      const amount = Number(expense.amount)

      switch (expense.frequency) {
        case 'DAILY':
          totals.monthly += amount * 30
          totals.yearly += amount * 365
          break
        case 'WEEKLY':
          totals.monthly += amount * 4.33
          totals.yearly += amount * 52
          break
        case 'BIWEEKLY':
          totals.monthly += amount * 2
          totals.yearly += amount * 26
          break
        case 'MONTHLY':
          totals.monthly += amount
          totals.yearly += amount * 12
          break
        case 'QUARTERLY':
          totals.monthly += amount / 3
          totals.yearly += amount * 4
          break
        case 'YEARLY':
          totals.monthly += amount / 12
          totals.yearly += amount
          break
      }
    }

    return NextResponse.json({
      data: expenses,
      totals: {
        monthly: Math.round(totals.monthly * 100) / 100,
        yearly: Math.round(totals.yearly * 100) / 100,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/recurring-expenses', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle spese ricorrenti' },
      { status: 500 }
    )
  }
}

// POST /api/recurring-expenses - Crea spesa ricorrente
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono creare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const venueId = body.venueId || session.user.venueId

    if (!venueId) {
      return NextResponse.json(
        { error: 'Sede non specificata' },
        { status: 400 }
      )
    }

    // Verifica accesso
    if (session.user.role !== 'admin' && session.user.venueId !== venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const validatedData = createExpenseSchema.parse(body)

    // Validazione frequenza-specifica
    if (validatedData.frequency === 'MONTHLY' && !validatedData.dayOfMonth) {
      return NextResponse.json(
        { error: 'Giorno del mese obbligatorio per frequenza mensile' },
        { status: 400 }
      )
    }
    if (validatedData.frequency === 'WEEKLY' && validatedData.dayOfWeek === undefined) {
      return NextResponse.json(
        { error: 'Giorno della settimana obbligatorio per frequenza settimanale' },
        { status: 400 }
      )
    }

    const expense = await prisma.recurringExpense.create({
      data: {
        venueId,
        name: validatedData.name,
        description: validatedData.description,
        amount: validatedData.amount,
        frequency: validatedData.frequency,
        dayOfMonth: validatedData.dayOfMonth,
        dayOfWeek: validatedData.dayOfWeek,
        startDate: validatedData.startDate
          ? new Date(validatedData.startDate)
          : null,
        endDate: validatedData.endDate
          ? new Date(validatedData.endDate)
          : null,
        accountId: validatedData.accountId,
        category: validatedData.category,
        createdBy: session.user.id,
      },
      include: {
        account: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/recurring-expenses', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della spesa ricorrente' },
      { status: 500 }
    )
  }
}
