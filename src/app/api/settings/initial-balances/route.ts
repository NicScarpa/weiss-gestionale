import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

import { logger } from '@/lib/logger'
// Schema per creazione/aggiornamento saldo iniziale
const initialBalanceSchema = z.object({
  venueId: z.string().min(1, 'Sede richiesta'),
  year: z.number().int().min(2000).max(2100),
  cashBalance: z.number().default(0),
  bankBalance: z.number().default(0),
  notes: z.string().optional(),
})

// GET /api/settings/initial-balances - Lista saldi iniziali
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può vedere saldi iniziali
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const year = searchParams.get('year')

    const where: Prisma.InitialBalanceWhereInput = {}
    if (venueId) where.venueId = venueId
    if (year) where.year = parseInt(year)

    const balances = await prisma.initialBalance.findMany({
      where,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { venue: { name: 'asc' } },
      ],
    })

    const formattedBalances = balances.map((b) => ({
      id: b.id,
      venueId: b.venueId,
      venue: b.venue,
      year: b.year,
      cashBalance: Number(b.cashBalance),
      bankBalance: Number(b.bankBalance),
      notes: b.notes,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }))

    return NextResponse.json({ data: formattedBalances })
  } catch (error) {
    logger.error('Errore GET /api/settings/initial-balances', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei saldi iniziali' },
      { status: 500 }
    )
  }
}

// POST /api/settings/initial-balances - Crea o aggiorna saldo iniziale
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può modificare saldi iniziali
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = initialBalanceSchema.parse(body)

    // Upsert (crea o aggiorna)
    const balance = await prisma.initialBalance.upsert({
      where: {
        venueId_year: {
          venueId: validatedData.venueId,
          year: validatedData.year,
        },
      },
      update: {
        cashBalance: validatedData.cashBalance,
        bankBalance: validatedData.bankBalance,
        notes: validatedData.notes,
      },
      create: {
        venueId: validatedData.venueId,
        year: validatedData.year,
        cashBalance: validatedData.cashBalance,
        bankBalance: validatedData.bankBalance,
        notes: validatedData.notes,
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    return NextResponse.json({
      id: balance.id,
      venueId: balance.venueId,
      venue: balance.venue,
      year: balance.year,
      cashBalance: Number(balance.cashBalance),
      bankBalance: Number(balance.bankBalance),
      notes: balance.notes,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/settings/initial-balances', error)
    return NextResponse.json(
      { error: 'Errore nel salvataggio del saldo iniziale' },
      { status: 500 }
    )
  }
}

// DELETE /api/settings/initial-balances - Elimina saldo iniziale
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può eliminare saldi iniziali
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID richiesto' }, { status: 400 })
    }

    await prisma.initialBalance.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/settings/initial-balances', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del saldo iniziale' },
      { status: 500 }
    )
  }
}
