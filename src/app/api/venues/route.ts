import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

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

// GET /api/venues - Lista sedi
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può vedere tutte le sedi
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const venues = await prisma.venue.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        defaultFloat: true,
        vatRate: true,
        isActive: true,
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
    console.error('Errore GET /api/venues:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle sedi' },
      { status: 500 }
    )
  }
}

// POST /api/venues - Crea nuova sede
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = venueSchema.parse(body)

    // Verifica codice unico
    const existingCode = await prisma.venue.findUnique({
      where: { code: validatedData.code.toUpperCase() },
    })

    if (existingCode) {
      return NextResponse.json(
        { error: 'Codice sede già esistente' },
        { status: 400 }
      )
    }

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
    console.error('Errore POST /api/venues:', error)

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
    console.error('Errore PUT /api/venues:', error)

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

// DELETE /api/venues - Elimina sede (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID sede obbligatorio' }, { status: 400 })
    }

    // Verifica esistenza
    const existing = await prisma.venue.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            closures: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    // Se ha chiusure, fai soft delete
    if (existing._count.closures > 0) {
      await prisma.venue.update({
        where: { id },
        data: { isActive: false },
      })
      return NextResponse.json({ message: 'Sede disattivata (aveva chiusure associate)' })
    }

    // Altrimenti elimina fisicamente
    await prisma.venue.delete({ where: { id } })

    return NextResponse.json({ message: 'Sede eliminata' })
  } catch (error) {
    console.error('Errore DELETE /api/venues:', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della sede' },
      { status: 500 }
    )
  }
}
