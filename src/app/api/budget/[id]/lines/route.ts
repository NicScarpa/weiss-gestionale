import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { upsertBudgetLinesSchema } from '@/lib/validations/budget'
import { calculateAnnualTotal, budgetLineToMonthlyValues } from '@/lib/budget-utils'

// GET /api/budget/[id]/lines - Lista righe budget
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

    // Verifica esistenza budget
    const budget = await prisma.budget.findUnique({
      where: { id },
      select: { venueId: true },
    })

    if (!budget) {
      return NextResponse.json({ error: 'Budget non trovato' }, { status: 404 })
    }

    // Verifica accesso sede
    if (session.user.role !== 'admin' && budget.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const lines = await prisma.budgetLine.findMany({
      where: { budgetId: id },
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
    })

    // Formatta le righe
    const formattedLines = lines.map((line) => ({
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

    return NextResponse.json({ data: formattedLines })
  } catch (error) {
    console.error('Errore GET /api/budget/[id]/lines:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle righe budget' },
      { status: 500 }
    )
  }
}

// POST /api/budget/[id]/lines - Crea o aggiorna righe budget
export async function POST(
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

    // Verifica esistenza budget
    const budget = await prisma.budget.findUnique({
      where: { id },
      select: { venueId: true, status: true },
    })

    if (!budget) {
      return NextResponse.json({ error: 'Budget non trovato' }, { status: 404 })
    }

    // Verifica accesso sede
    if (session.user.role !== 'admin' && budget.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Non si possono modificare budget archiviati
    if (budget.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: 'Non è possibile modificare un budget archiviato' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validatedData = upsertBudgetLinesSchema.parse(body)

    // Verifica che tutti i conti esistano
    const accountIds = validatedData.lines.map((l) => l.accountId)
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true },
    })

    if (accounts.length !== accountIds.length) {
      return NextResponse.json(
        { error: 'Uno o più conti non esistono' },
        { status: 400 }
      )
    }

    // Upsert delle righe (transazione)
    const results = await prisma.$transaction(
      validatedData.lines.map((line) => {
        const monthlyValues = {
          jan: line.jan,
          feb: line.feb,
          mar: line.mar,
          apr: line.apr,
          may: line.may,
          jun: line.jun,
          jul: line.jul,
          aug: line.aug,
          sep: line.sep,
          oct: line.oct,
          nov: line.nov,
          dec: line.dec,
        }

        const annualTotal = calculateAnnualTotal(monthlyValues)

        return prisma.budgetLine.upsert({
          where: {
            budgetId_accountId: {
              budgetId: id,
              accountId: line.accountId,
            },
          },
          update: {
            ...monthlyValues,
            annualTotal,
            notes: line.notes,
          },
          create: {
            budgetId: id,
            accountId: line.accountId,
            ...monthlyValues,
            annualTotal,
            notes: line.notes,
          },
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
        })
      })
    )

    // Formatta le righe
    const formattedLines = results.map((line) => ({
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

    return NextResponse.json({ data: formattedLines }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/budget/[id]/lines:', error)
    return NextResponse.json(
      { error: 'Errore nel salvataggio delle righe budget' },
      { status: 500 }
    )
  }
}

// DELETE /api/budget/[id]/lines - Elimina una riga budget specifica
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

    // Solo admin o manager possono modificare budget
    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Non hai i permessi per modificare budget' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const lineId = searchParams.get('lineId')
    const accountId = searchParams.get('accountId')

    if (!lineId && !accountId) {
      return NextResponse.json(
        { error: 'Specificare lineId o accountId' },
        { status: 400 }
      )
    }

    // Verifica esistenza budget
    const budget = await prisma.budget.findUnique({
      where: { id },
      select: { venueId: true, status: true },
    })

    if (!budget) {
      return NextResponse.json({ error: 'Budget non trovato' }, { status: 404 })
    }

    // Verifica accesso sede
    if (session.user.role !== 'admin' && budget.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Non si possono modificare budget archiviati
    if (budget.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: 'Non è possibile modificare un budget archiviato' },
        { status: 400 }
      )
    }

    // Elimina la riga
    if (lineId) {
      await prisma.budgetLine.delete({
        where: { id: lineId },
      })
    } else if (accountId) {
      await prisma.budgetLine.delete({
        where: {
          budgetId_accountId: {
            budgetId: id,
            accountId,
          },
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Errore DELETE /api/budget/[id]/lines:', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della riga budget' },
      { status: 500 }
    )
  }
}
