import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const bankAccountSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  accountType: z.enum(['CASH', 'BANK']),
  bankName: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  bic: z.string().optional().nullable(),
  initialBalance: z.number().default(0),
  currency: z.string().default('EUR'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  color: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// GET /api/bank-accounts
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venueId = await getVenueId()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const where: Record<string, unknown> = { venueId }
    if (type === 'CASH' || type === 'BANK') {
      where.accountType = type
    }
    if (!includeInactive) {
      where.isActive = true
    }

    const accounts = await prisma.bankAccount.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    const formatted = accounts.map((a) => ({
      ...a,
      initialBalance: Number(a.initialBalance),
    }))

    return NextResponse.json({ accounts: formatted })
  } catch (error) {
    logger.error('Errore GET /api/bank-accounts', error)
    return NextResponse.json({ error: 'Errore nel recupero dei conti' }, { status: 500 })
  }
}

// POST /api/bank-accounts
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const body = await request.json()
    const data = bankAccountSchema.parse(body)

    // Se isDefault, rimuovi default dagli altri dello stesso tipo
    if (data.isDefault) {
      await prisma.bankAccount.updateMany({
        where: { venueId, accountType: data.accountType, isDefault: true },
        data: { isDefault: false },
      })
    }

    const account = await prisma.bankAccount.create({
      data: {
        venueId,
        name: data.name,
        accountType: data.accountType,
        bankName: data.bankName,
        iban: data.iban,
        bic: data.bic,
        initialBalance: data.initialBalance,
        currency: data.currency,
        isDefault: data.isDefault,
        isActive: data.isActive,
        color: data.color,
        notes: data.notes,
      },
    })

    return NextResponse.json({
      account: { ...account, initialBalance: Number(account.initialBalance) },
    })
  } catch (error) {
    logger.error('Errore POST /api/bank-accounts', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Errore nella creazione del conto' }, { status: 500 })
  }
}

// PUT /api/bank-accounts
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const body = await request.json()
    const { id, ...rest } = body

    if (!id) {
      return NextResponse.json({ error: 'ID obbligatorio' }, { status: 400 })
    }

    const data = bankAccountSchema.partial().parse(rest)

    const existing = await prisma.bankAccount.findUnique({ where: { id } })
    if (!existing || existing.venueId !== venueId) {
      return NextResponse.json({ error: 'Conto non trovato' }, { status: 404 })
    }

    // Se isDefault, rimuovi default dagli altri dello stesso tipo
    if (data.isDefault) {
      const accountType = data.accountType || existing.accountType
      await prisma.bankAccount.updateMany({
        where: { venueId, accountType, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
    }

    const account = await prisma.bankAccount.update({
      where: { id },
      data,
    })

    return NextResponse.json({
      account: { ...account, initialBalance: Number(account.initialBalance) },
    })
  } catch (error) {
    logger.error('Errore PUT /api/bank-accounts', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Errore nell\'aggiornamento del conto' }, { status: 500 })
  }
}

// DELETE /api/bank-accounts
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID obbligatorio' }, { status: 400 })
    }

    const existing = await prisma.bankAccount.findUnique({ where: { id } })
    if (!existing || existing.venueId !== venueId) {
      return NextResponse.json({ error: 'Conto non trovato' }, { status: 404 })
    }

    // Archivia (soft delete)
    await prisma.bankAccount.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/bank-accounts', error)
    return NextResponse.json({ error: 'Errore nell\'archiviazione del conto' }, { status: 500 })
  }
}
