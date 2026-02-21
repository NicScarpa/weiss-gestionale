import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Schema validazione
const venueSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  code: z.string().min(1, 'Codice obbligatorio').max(10, 'Codice max 10 caratteri'),
  address: z.string().optional().nullable(),
  defaultFloat: z.number().min(0).default(114),
  vatRate: z.number().min(0).max(100).default(10),
  isActive: z.boolean().default(true),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
})

// GET /api/venues - Restituisce la sede (singola)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        defaultFloat: true,
        vatRate: true,
        isActive: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            closures: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Converti Decimal a number
    const formattedVenues = venues.map((v) => ({
      ...v,
      defaultFloat: Number(v.defaultFloat),
      vatRate: Number(v.vatRate),
    }))

    return NextResponse.json({ venues: formattedVenues })
  } catch (error) {
    logger.error('Errore GET /api/venues', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle sedi' },
      { status: 500 }
    )
  }
}

// POST /api/venues - Bloccata: sede singola
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Verifica che non esista già una sede
    const existingCount = await prisma.venue.count()
    if (existingCount > 0) {
      return NextResponse.json(
        { error: 'Esiste già una sede configurata. Questa installazione supporta una sola sede.' },
        { status: 409 }
      )
    }

    const body = await request.json()
    const validatedData = venueSchema.parse(body)

    const venue = await prisma.venue.create({
      data: {
        name: validatedData.name,
        code: validatedData.code.toUpperCase(),
        address: validatedData.address,
        defaultFloat: validatedData.defaultFloat,
        vatRate: validatedData.vatRate,
        isActive: validatedData.isActive,
      },
    })

    return NextResponse.json({
      venue: {
        ...venue,
        defaultFloat: Number(venue.defaultFloat),
        vatRate: Number(venue.vatRate),
      },
    })
  } catch (error) {
    logger.error('Errore POST /api/venues', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella creazione della sede' },
      { status: 500 }
    )
  }
}

// PUT /api/venues - Aggiorna sede
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'ID sede obbligatorio' }, { status: 400 })
    }

    const validatedData = venueSchema.partial().parse(data)

    // Verifica esistenza
    const existing = await prisma.venue.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    // Verifica codice unico se modificato
    if (validatedData.code && validatedData.code.toUpperCase() !== existing.code) {
      const existingCode = await prisma.venue.findUnique({
        where: { code: validatedData.code.toUpperCase() },
      })
      if (existingCode) {
        return NextResponse.json(
          { error: 'Codice sede già esistente' },
          { status: 400 }
        )
      }
    }

    const venue = await prisma.venue.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.code && { code: validatedData.code.toUpperCase() }),
        ...(validatedData.address !== undefined && { address: validatedData.address }),
        ...(validatedData.defaultFloat !== undefined && { defaultFloat: validatedData.defaultFloat }),
        ...(validatedData.vatRate !== undefined && { vatRate: validatedData.vatRate }),
        ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
        ...(validatedData.latitude !== undefined && { latitude: validatedData.latitude }),
        ...(validatedData.longitude !== undefined && { longitude: validatedData.longitude }),
      },
    })

    return NextResponse.json({
      venue: {
        ...venue,
        defaultFloat: Number(venue.defaultFloat),
        vatRate: Number(venue.vatRate),
      },
    })
  } catch (error) {
    logger.error('Errore PUT /api/venues', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della sede' },
      { status: 500 }
    )
  }
}

// DELETE /api/venues - Bloccata: non è possibile eliminare la sede singola
export async function DELETE() {
  return NextResponse.json(
    { error: 'Non è possibile eliminare la sede. Questa installazione richiede una sede attiva.' },
    { status: 403 }
  )
}
