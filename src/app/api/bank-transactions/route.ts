import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  bankTransactionFiltersSchema,
  createBankTransactionSchema,
} from '@/lib/validations/reconciliation'
import type { ReconciliationStatus } from '@/types/reconciliation'

// GET /api/bank-transactions - Lista transazioni bancarie
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const params = bankTransactionFiltersSchema.parse({
      venueId: searchParams.get('venueId') || undefined,
      status: searchParams.get('status') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      search: searchParams.get('search') || undefined,
      importBatchId: searchParams.get('importBatchId') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 50,
    })

    const { venueId, status, dateFrom, dateTo, search, importBatchId, page, limit } = params

    // Costruisci where clause
    const where: Record<string, unknown> = {}

    if (venueId) {
      where.venueId = venueId
    }

    if (status) {
      where.status = status
    }

    if (importBatchId) {
      where.importBatchId = importBatchId
    }

    if (dateFrom || dateTo) {
      where.transactionDate = {}
      if (dateFrom) {
        (where.transactionDate as Record<string, Date>).gte = new Date(dateFrom)
      }
      if (dateTo) {
        (where.transactionDate as Record<string, Date>).lte = new Date(dateTo)
      }
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { bankReference: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Query con paginazione
    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: {
          venue: {
            select: { id: true, name: true, code: true },
          },
          matchedEntry: {
            select: {
              id: true,
              date: true,
              description: true,
              debitAmount: true,
              creditAmount: true,
              documentRef: true,
            },
          },
        },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bankTransaction.count({ where }),
    ])

    // Calcola summary per status
    const summary = await prisma.bankTransaction.groupBy({
      by: ['status'],
      where: venueId ? { venueId } : undefined,
      _count: { id: true },
    })

    const summaryMap = summary.reduce(
      (acc, item) => {
        acc[item.status] = item._count.id
        return acc
      },
      {} as Record<ReconciliationStatus, number>
    )

    return NextResponse.json({
      data: transactions.map((tx) => ({
        ...tx,
        amount: Number(tx.amount),
        balanceAfter: tx.balanceAfter ? Number(tx.balanceAfter) : null,
        matchConfidence: tx.matchConfidence ? Number(tx.matchConfidence) : null,
        matchedEntry: tx.matchedEntry
          ? {
              ...tx.matchedEntry,
              debitAmount: tx.matchedEntry.debitAmount
                ? Number(tx.matchedEntry.debitAmount)
                : null,
              creditAmount: tx.matchedEntry.creditAmount
                ? Number(tx.matchedEntry.creditAmount)
                : null,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        total,
        pending: summaryMap.PENDING || 0,
        matched: summaryMap.MATCHED || 0,
        toReview: summaryMap.TO_REVIEW || 0,
        manual: summaryMap.MANUAL || 0,
        ignored: summaryMap.IGNORED || 0,
        unmatched: summaryMap.UNMATCHED || 0,
      },
    })
  } catch (error) {
    console.error('GET /api/bank-transactions error:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle transazioni' },
      { status: 500 }
    )
  }
}

// POST /api/bank-transactions - Crea transazione manuale
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = createBankTransactionSchema.parse(body)

    // Verifica che la venue esista
    const venue = await prisma.venue.findUnique({
      where: { id: data.venueId },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    // Crea la transazione
    const transaction = await prisma.bankTransaction.create({
      data: {
        venueId: data.venueId,
        transactionDate: new Date(data.transactionDate),
        valueDate: data.valueDate ? new Date(data.valueDate) : null,
        description: data.description,
        amount: data.amount,
        balanceAfter: data.balanceAfter || null,
        bankReference: data.bankReference || null,
        importSource: 'MANUAL',
        status: 'PENDING',
      },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
      },
    })

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      balanceAfter: transaction.balanceAfter ? Number(transaction.balanceAfter) : null,
    })
  } catch (error) {
    console.error('POST /api/bank-transactions error:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della transazione' },
      { status: 500 }
    )
  }
}
