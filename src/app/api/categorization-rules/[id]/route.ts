import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/categorization-rules/[id] - Dettaglio regola
export async function GET(
  request: NextRequest,
  context: { params },
) {
  const { id } = await context.params as { id: string }
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const rule = await prisma.categorizationRule.findUnique({
      where: { id },
      include: {
        venue: { select: { id: true, name: true, code: true } },
        budgetCategory: { select: { id: true, code: true, name: true, color: true } },
        account: { select: { id: true, code: true, name: true } },
      },
    })

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const userVenues = session.user.venues || []
    if (!userVenues.includes(rule.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(rule)
  } catch (error) {
    console.error('Error fetching categorization rule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/categorization-rules/[id] - Aggiorna regola
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Verifica esistenza e permessi
    const existing = await prisma.categorizationRule.findUnique({
      where: { id },
      select: { venueId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const userVenues = session.user.venues || []
    if (!userVenues.includes(existing.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Campi aggiornabili
    const updatable = [
      'name', 'direction', 'keywords', 'priority', 'isActive',
      'budgetCategoryId', 'accountId', 'autoVerify', 'autoHide',
    ]
    const data: any = {}
    for (const field of updatable) {
      if (body[field] !== undefined) {
        data[field] = body[field]
      }
    }

    const rule = await prisma.categorizationRule.update({
      where: { id },
      data,
      include: {
        venue: { select: { id: true, name: true, code: true } },
        budgetCategory: { select: { id: true, code: true, name: true, color: true } },
        account: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(rule)
  } catch (error) {
    console.error('Error updating categorization rule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/categorization-rules/[id] - Elimina regola
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Verifica esistenza e permessi
    const existing = await prisma.categorizationRule.findUnique({
      where: { id },
      select: { venueId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const userVenues = session.user.venues || []
    if (!userVenues.includes(existing.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.categorizationRule.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting categorization rule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
