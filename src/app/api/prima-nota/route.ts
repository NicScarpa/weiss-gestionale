import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  createJournalEntrySchema,
  journalEntryFiltersSchema,
} from '@/lib/validations/prima-nota'
import { toDebitCredit, calculateTotals } from '@/lib/prima-nota-utils'

// GET /api/prima-nota - Lista movimenti con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Parse filtri
    const filters = journalEntryFiltersSchema.parse({
      registerType: searchParams.get('registerType') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      entryType: searchParams.get('entryType') || undefined,
      accountId: searchParams.get('accountId') || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '50',
    })

    // Costruisci where clause
    const where: any = {}

    // Filtra per sede (admin vede tutte, altri solo la propria)
    if (session.user.role !== 'admin') {
      where.venueId = session.user.venueId
    } else if (searchParams.get('venueId')) {
      where.venueId = searchParams.get('venueId')
    }

    if (filters.registerType) {
      where.registerType = filters.registerType
    }

    if (filters.dateFrom || filters.dateTo) {
      where.date = {}
      if (filters.dateFrom) {
        where.date.gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        where.date.lte = new Date(filters.dateTo)
      }
    }

    if (filters.accountId) {
      where.accountId = filters.accountId
    }

    if (filters.search) {
      where.description = {
        contains: filters.search,
        mode: 'insensitive',
      }
    }

    // Query con paginazione
    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          account: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          closure: {
            select: {
              id: true,
              date: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.journalEntry.count({ where }),
    ])

    // Calcola totali
    const allEntries = await prisma.journalEntry.findMany({
      where,
      select: {
        debitAmount: true,
        creditAmount: true,
      },
    })

    const summary = calculateTotals(
      allEntries.map((e) => ({
        ...e,
        debitAmount: e.debitAmount ? Number(e.debitAmount) : undefined,
        creditAmount: e.creditAmount ? Number(e.creditAmount) : undefined,
      })) as any
    )

    // Formatta risposta
    const formattedEntries = entries.map((entry) => ({
      id: entry.id,
      venueId: entry.venueId,
      date: entry.date,
      registerType: entry.registerType,
      documentRef: entry.documentRef,
      documentType: entry.documentType,
      description: entry.description,
      debitAmount: entry.debitAmount ? Number(entry.debitAmount) : null,
      creditAmount: entry.creditAmount ? Number(entry.creditAmount) : null,
      vatAmount: entry.vatAmount ? Number(entry.vatAmount) : null,
      accountId: entry.accountId,
      closureId: entry.closureId,
      runningBalance: entry.runningBalance ? Number(entry.runningBalance) : null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      venue: entry.venue,
      account: entry.account,
      closure: entry.closure,
      createdBy: entry.createdBy,
    }))

    return NextResponse.json({
      data: formattedEntries,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
      summary,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore GET /api/prima-nota:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei movimenti' },
      { status: 500 }
    )
  }
}

// POST /api/prima-nota - Crea nuovo movimento
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica che l'utente abbia una sede
    if (!session.user.venueId) {
      return NextResponse.json(
        { error: 'Nessuna sede assegnata' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validatedData = createJournalEntrySchema.parse(body)

    // Converti in dare/avere
    const { debitAmount, creditAmount } = toDebitCredit(
      validatedData.registerType,
      validatedData.entryType,
      validatedData.amount
    )

    // Crea il movimento
    const entry = await prisma.journalEntry.create({
      data: {
        venueId: session.user.venueId,
        date: validatedData.date,
        registerType: validatedData.registerType,
        description: validatedData.description,
        documentRef: validatedData.documentRef,
        documentType: validatedData.documentType,
        debitAmount,
        creditAmount,
        vatAmount: validatedData.vatAmount,
        accountId: validatedData.accountId,
        createdById: session.user.id,
      },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
        account: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    return NextResponse.json(
      {
        ...entry,
        debitAmount: entry.debitAmount ? Number(entry.debitAmount) : null,
        creditAmount: entry.creditAmount ? Number(entry.creditAmount) : null,
        vatAmount: entry.vatAmount ? Number(entry.vatAmount) : null,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/prima-nota:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione del movimento' },
      { status: 500 }
    )
  }
}
