import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema validazione
const supplierSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  vatNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  email: z.string().email('Email non valida').optional().nullable(),
  iban: z.string().optional().nullable(),
  defaultAccountId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
})

// GET /api/suppliers - Lista fornitori
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const full = searchParams.get('full') === 'true' // Include tutti i campi

    const where: any = {}

    if (!includeInactive) {
      where.isActive = true
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { vatNumber: { contains: query, mode: 'insensitive' } },
      ]
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        vatNumber: true,
        ...(full && {
          address: true,
          city: true,
          province: true,
          postalCode: true,
          email: true,
          iban: true,
          defaultAccountId: true,
          defaultAccount: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          isActive: true,
          createdAt: true,
        }),
      },
      orderBy: {
        name: 'asc',
      },
      ...(full ? {} : { take: 50 }),
    })

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('Errore GET /api/suppliers:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei fornitori' },
      { status: 500 }
    )
  }
}

// POST /api/suppliers - Crea nuovo fornitore
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
    const validatedData = supplierSchema.parse(body)

    const supplier = await prisma.supplier.create({
      data: {
        name: validatedData.name,
        vatNumber: validatedData.vatNumber,
        address: validatedData.address,
        city: validatedData.city,
        province: validatedData.province,
        postalCode: validatedData.postalCode,
        email: validatedData.email,
        iban: validatedData.iban,
        defaultAccountId: validatedData.defaultAccountId,
        isActive: validatedData.isActive,
      },
      include: {
        defaultAccount: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ supplier })
  } catch (error) {
    console.error('Errore POST /api/suppliers:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella creazione del fornitore' },
      { status: 500 }
    )
  }
}

// PUT /api/suppliers - Aggiorna fornitore
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
      return NextResponse.json({ error: 'ID fornitore obbligatorio' }, { status: 400 })
    }

    const validatedData = supplierSchema.partial().parse(data)

    // Verifica esistenza
    const existing = await prisma.supplier.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Fornitore non trovato' }, { status: 404 })
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.vatNumber !== undefined && { vatNumber: validatedData.vatNumber }),
        ...(validatedData.address !== undefined && { address: validatedData.address }),
        ...(validatedData.city !== undefined && { city: validatedData.city }),
        ...(validatedData.province !== undefined && { province: validatedData.province }),
        ...(validatedData.postalCode !== undefined && { postalCode: validatedData.postalCode }),
        ...(validatedData.email !== undefined && { email: validatedData.email }),
        ...(validatedData.iban !== undefined && { iban: validatedData.iban }),
        ...(validatedData.defaultAccountId !== undefined && { defaultAccountId: validatedData.defaultAccountId }),
        ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
      },
      include: {
        defaultAccount: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    })

    // Propaga le modifiche alle fatture collegate
    if (validatedData.name || validatedData.vatNumber) {
      await prisma.electronicInvoice.updateMany({
        where: { supplierId: id },
        data: {
          ...(validatedData.name && { supplierName: validatedData.name }),
          ...(validatedData.vatNumber && { supplierVat: validatedData.vatNumber }),
        },
      })
    }

    return NextResponse.json({ supplier })
  } catch (error) {
    console.error('Errore PUT /api/suppliers:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del fornitore' },
      { status: 500 }
    )
  }
}

// DELETE /api/suppliers - Elimina fornitore (soft delete)
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
      return NextResponse.json({ error: 'ID fornitore obbligatorio' }, { status: 400 })
    }

    // Verifica esistenza
    const existing = await prisma.supplier.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Fornitore non trovato' }, { status: 404 })
    }

    // Soft delete
    await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Fornitore disattivato' })
  } catch (error) {
    console.error('Errore DELETE /api/suppliers:', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del fornitore' },
      { status: 500 }
    )
  }
}
