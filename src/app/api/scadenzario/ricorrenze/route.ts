import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { calcolaProssimaGenerazione, isFrequenzaSettimanale, isFrequenzaMensile } from '@/lib/recurrence-utils'
import { getVenueId } from '@/lib/venue'

const createRecurrenceSchema = z.object({
  tipo: z.enum(['attiva', 'passiva']),
  descrizione: z.string().min(1, 'Descrizione obbligatoria'),
  importo: z.number().positive('Importo deve essere positivo'),
  categoriaId: z.string().optional(),
  contoDiPagamentoId: z.string().optional(),
  metodoPagamento: z.string().optional(),
  frequenza: z.enum(['settimanale', 'bisettimanale', 'mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale']),
  giornoDelMese: z.number().int().min(1).max(31).optional(),
  giornoDellSettimana: z.number().int().min(0).max(6).optional(),
  dataInizio: z.coerce.date().or(z.string()),
  dataFine: z.coerce.date().or(z.string()).optional().nullable(),
  note: z.string().optional(),
})

// GET /api/scadenzario/ricorrenze - Lista ricorrenze con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo')
    const search = searchParams.get('search')
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const venueId = await getVenueId()

    const where: Prisma.RecurrenceWhereInput = { venueId }

    if (tipo) {
      where.tipo = tipo
    }

    if (isActive === 'true') {
      where.isActive = true
    } else if (isActive === 'false') {
      where.isActive = false
    }

    if (search) {
      where.OR = [
        { descrizione: { contains: search, mode: 'insensitive' } },
      ]
    }

    const total = await prisma.recurrence.count({ where })

    const recurrences = await prisma.recurrence.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        categoria: {
          select: {
            id: true,
            name: true,
            parent: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            generatedSchedules: true,
          },
        },
      },
    })

    return NextResponse.json({
      data: recurrences,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/ricorrenze', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle ricorrenze' },
      { status: 500 }
    )
  }
}

// POST /api/scadenzario/ricorrenze - Crea nuova ricorrenza
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validated = createRecurrenceSchema.parse(body)

    const venueId = await getVenueId()

    // Validazione: giorno obbligatorio per frequenze specifiche
    if (isFrequenzaSettimanale(validated.frequenza) && validated.giornoDellSettimana === undefined) {
      return NextResponse.json(
        { error: 'Giorno della settimana obbligatorio per frequenze settimanali' },
        { status: 400 }
      )
    }

    if (isFrequenzaMensile(validated.frequenza) && validated.giornoDelMese === undefined) {
      return NextResponse.json(
        { error: 'Giorno del mese obbligatorio per frequenze mensili e superiori' },
        { status: 400 }
      )
    }

    const dataInizio = new Date(validated.dataInizio)
    const dataFine = validated.dataFine ? new Date(validated.dataFine) : null
    const prossimaGenerazione = calcolaProssimaGenerazione(dataInizio, validated.frequenza)

    const recurrence = await prisma.recurrence.create({
      data: {
        venueId,
        tipo: validated.tipo,
        descrizione: validated.descrizione,
        importo: validated.importo,
        categoriaId: validated.categoriaId,
        contoDiPagamentoId: validated.contoDiPagamentoId,
        metodoPagamento: validated.metodoPagamento,
        frequenza: validated.frequenza,
        giornoDelMese: validated.giornoDelMese,
        giornoDellSettimana: validated.giornoDellSettimana,
        dataInizio,
        dataFine,
        prossimaGenerazione,
        note: validated.note,
        createdById: session.user.id,
      },
      include: {
        categoria: {
          select: {
            id: true,
            name: true,
            parent: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            generatedSchedules: true,
          },
        },
      },
    })

    return NextResponse.json({ recurrence }, { status: 201 })
  } catch (error) {
    logger.error('Errore POST /api/scadenzario/ricorrenze', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella creazione della ricorrenza' },
      { status: 500 }
    )
  }
}
