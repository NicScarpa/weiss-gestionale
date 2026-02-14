import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  direction: z.enum(['INFLOW', 'OUTFLOW']).optional(),
  keywords: z.array(z.string()).optional(),
  priority: z.number().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  budgetCategoryId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  autoVerify: z.boolean().optional(),
  autoHide: z.boolean().optional(),
})

/**
 * PATCH /api/categorizzazione/[id]
 * Aggiorna regola di categorizzazione
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const current = await prisma.categorizationRule.findUnique({
      where: { id: params.id },
      select: { venueId: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    // Verifica autorizzazione sede
    if (session.user.role !== 'admin' && current.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    const body = await request.json()
    const validated = updateRuleSchema.parse(body)

    const updated = await prisma.categorizationRule.update({
      where: { id: params.id },
      data: {
        ...validated,
        updatedAt: new Date(),
      },
      include: {
        budgetCategory: {
          select: { id: true, code: true, name: true, color: true },
        },
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

    console.error('Errore PATCH /api/categorizzazione/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della regola' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/categorizzazione/[id]
 * Elimina regola di categorizzazione
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const current = await prisma.categorizationRule.findUnique({
      where: { id: params.id },
      select: { venueId: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    // Verifica autorizzazione sede
    if (session.user.role !== 'admin' && current.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    await prisma.categorizationRule.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Errore DELETE /api/categorizzazione/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della regola' },
      { status: 500 }
    )
  }
}
