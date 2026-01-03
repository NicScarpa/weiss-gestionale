import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per creazione staff
const createStaffSchema = z.object({
  firstName: z.string().min(1, 'Nome richiesto'),
  lastName: z.string().min(1, 'Cognome richiesto'),
  email: z.string().email('Email non valida'),
  isFixedStaff: z.boolean().default(true),
  hourlyRate: z.number().min(0).nullable().optional(),
  defaultShift: z.enum(['MORNING', 'EVENING']).nullable().optional(),
  venueId: z.string().optional(),
})

// Schema per aggiornamento staff
const updateStaffSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isFixedStaff: z.boolean().optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  defaultShift: z.enum(['MORNING', 'EVENING']).nullable().optional(),
  isActive: z.boolean().optional(),
})

// GET /api/staff - Lista dipendenti (staff)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può vedere tutti gli staff
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const isFixedStaff = searchParams.get('isFixedStaff')
    const showInactive = searchParams.get('showInactive') === 'true'
    const includeInactive = searchParams.get('includeInactive') === 'true' // deprecated, use showInactive

    // Costruisci where clause
    const where: any = {
      // Escludi admin dalla lista dipendenti
      role: {
        name: { not: 'admin' }
      }
    }

    // Filtro per stato attivo/inattivo
    if (showInactive) {
      // Mostra solo inattivi
      where.isActive = false
    } else if (!includeInactive) {
      // Default: mostra solo attivi
      where.isActive = true
    }
    // Se includeInactive=true, non filtra per isActive (mostra tutti)

    if (venueId) {
      where.venueId = venueId
    }

    if (isFixedStaff !== null && isFixedStaff !== undefined) {
      where.isFixedStaff = isFixedStaff === 'true'
    }

    const staff = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isFixedStaff: true,
        hourlyRate: true,
        defaultShift: true,
        isActive: true,
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { isFixedStaff: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    })

    return NextResponse.json({ data: staff })
  } catch (error) {
    console.error('Errore GET /api/staff:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello staff' },
      { status: 500 }
    )
  }
}

// PUT /api/staff - Aggiorna dipendente
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può modificare staff
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'ID dipendente richiesto' }, { status: 400 })
    }

    const validatedData = updateStaffSchema.parse(data)

    // Prepara dati per update
    const updateData: any = {}

    if (validatedData.firstName !== undefined) {
      updateData.firstName = validatedData.firstName
    }
    if (validatedData.lastName !== undefined) {
      updateData.lastName = validatedData.lastName
    }
    if (validatedData.isFixedStaff !== undefined) {
      updateData.isFixedStaff = validatedData.isFixedStaff
    }
    if (validatedData.hourlyRate !== undefined) {
      updateData.hourlyRate = validatedData.hourlyRate
    }
    if (validatedData.defaultShift !== undefined) {
      updateData.defaultShift = validatedData.defaultShift
    }
    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive
    }

    const updatedStaff = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isFixedStaff: true,
        hourlyRate: true,
        defaultShift: true,
        isActive: true,
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    return NextResponse.json(updatedStaff)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PUT /api/staff:', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del dipendente' },
      { status: 500 }
    )
  }
}

// POST /api/staff - Crea nuovo dipendente
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può creare staff
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createStaffSchema.parse(body)

    // Verifica email unica
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email già registrata' },
        { status: 400 }
      )
    }

    // Trova il ruolo "staff"
    const staffRole = await prisma.role.findFirst({
      where: { name: 'staff' },
    })

    if (!staffRole) {
      return NextResponse.json(
        { error: 'Ruolo staff non trovato' },
        { status: 500 }
      )
    }

    // Crea il nuovo dipendente
    const newStaff = await prisma.user.create({
      data: {
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.email,
        isFixedStaff: validatedData.isFixedStaff,
        hourlyRate: validatedData.hourlyRate ?? null,
        defaultShift: validatedData.defaultShift ?? null,
        venueId: validatedData.venueId || session.user.venueId || null,
        roleId: staffRole.id,
        isActive: true,
        // Password temporanea (utente dovrà cambiarla al primo accesso)
        passwordHash: '',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isFixedStaff: true,
        hourlyRate: true,
        defaultShift: true,
        isActive: true,
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(newStaff, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/staff:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del dipendente' },
      { status: 500 }
    )
  }
}
