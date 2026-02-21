import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { calcolaProssimaGenerazione } from '@/lib/recurrence-utils'

const updateRecurrenceSchema = z.object({
  descrizione: z.string().min(1).optional(),
  importo: z.number().positive().optional(),
  categoriaId: z.string().nullable().optional(),
  contoDiPagamentoId: z.string().nullable().optional(),
  metodoPagamento: z.string().nullable().optional(),
  frequenza: z.enum(['settimanale', 'bisettimanale', 'mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale']).optional(),
  giornoDelMese: z.number().int().min(1).max(31).nullable().optional(),
  giornoDellSettimana: z.number().int().min(0).max(6).nullable().optional(),
  dataInizio: z.coerce.date().or(z.string()).optional(),
  dataFine: z.coerce.date().or(z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
  note: z.string().nullable().optional(),
})

// GET /api/scadenzario/ricorrenze/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const recurrence = await prisma.recurrence.findUnique({
      where: { id },
      include: {
        categoria: {
          select: {
            id: true,
            name: true,
            parent: {
              select: { id: true, name: true },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { generatedSchedules: true },
        },
      },
    })

    if (!recurrence) {
      return NextResponse.json({ error: 'Ricorrenza non trovata' }, { status: 404 })
    }

    return NextResponse.json({ recurrence })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/ricorrenze/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della ricorrenza' },
      { status: 500 }
    )
  }
}

// PATCH /api/scadenzario/ricorrenze/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateRecurrenceSchema.parse(body)

    const existing = await prisma.recurrence.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Ricorrenza non trovata' }, { status: 404 })
    }

    // Ricalcola prossimaGenerazione se la frequenza cambia
    const updateData: Record<string, unknown> = { ...validated }

    if (validated.dataInizio) {
      updateData.dataInizio = new Date(validated.dataInizio)
    }
    if (validated.dataFine !== undefined) {
      updateData.dataFine = validated.dataFine ? new Date(validated.dataFine) : null
    }

    if (validated.frequenza || validated.dataInizio) {
      const frequenza = validated.frequenza || existing.frequenza
      const baseDate = validated.dataInizio
        ? new Date(validated.dataInizio)
        : existing.prossimaGenerazione || existing.dataInizio
      updateData.prossimaGenerazione = calcolaProssimaGenerazione(baseDate, frequenza)
    }

    const recurrence = await prisma.recurrence.update({
      where: { id },
      data: updateData,
      include: {
        categoria: {
          select: {
            id: true,
            name: true,
            parent: {
              select: { id: true, name: true },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { generatedSchedules: true },
        },
      },
    })

    return NextResponse.json({ recurrence })
  } catch (error) {
    logger.error('Errore PATCH /api/scadenzario/ricorrenze/[id]', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della ricorrenza' },
      { status: 500 }
    )
  }
}

// DELETE /api/scadenzario/ricorrenze/[id] - Soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.recurrence.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Ricorrenza non trovata' }, { status: 404 })
    }

    await prisma.recurrence.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/ricorrenze/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della ricorrenza' },
      { status: 500 }
    )
  }
}
