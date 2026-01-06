import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { summaryQuerySchema } from '@/lib/validations/reconciliation'
import type { ReconciliationSummary, ReconciliationStatus } from '@/types/reconciliation'

// GET /api/reconciliation/summary - Summary per dashboard
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const params = summaryQuerySchema.parse({
      venueId: searchParams.get('venueId') || '',
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    })

    const { venueId, dateFrom, dateTo } = params

    // Build date filter
    const dateFilter: Record<string, Date> = {}
    if (dateFrom) {
      dateFilter.gte = new Date(dateFrom)
    }
    if (dateTo) {
      dateFilter.lte = new Date(dateTo)
    }

    // Query per conteggio status
    const statusCounts = await prisma.bankTransaction.groupBy({
      by: ['status'],
      where: {
        venueId,
        ...(Object.keys(dateFilter).length > 0
          ? { transactionDate: dateFilter }
          : {}),
      },
      _count: { id: true },
    })

    const statusMap = statusCounts.reduce(
      (acc, item) => {
        acc[item.status as ReconciliationStatus] = item._count.id
        return acc
      },
      {} as Record<ReconciliationStatus, number>
    )

    // Calcola saldo banca (ultima transazione con saldo)
    const lastTxWithBalance = await prisma.bankTransaction.findFirst({
      where: {
        venueId,
        balanceAfter: { not: null },
        ...(Object.keys(dateFilter).length > 0
          ? { transactionDate: dateFilter }
          : {}),
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      select: { balanceAfter: true },
    })

    // Calcola saldo contabile (movimenti BANCA in prima nota)
    const ledgerBalance = await prisma.journalEntry.aggregate({
      where: {
        venueId,
        registerType: 'BANK',
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
      _sum: {
        debitAmount: true,
        creditAmount: true,
      },
    })

    const bankBalance = lastTxWithBalance?.balanceAfter
      ? Number(lastTxWithBalance.balanceAfter)
      : 0
    const ledgerSum =
      Number(ledgerBalance._sum.debitAmount || 0) -
      Number(ledgerBalance._sum.creditAmount || 0)

    const summary: ReconciliationSummary = {
      totalTransactions:
        (statusMap.PENDING || 0) +
        (statusMap.MATCHED || 0) +
        (statusMap.TO_REVIEW || 0) +
        (statusMap.MANUAL || 0) +
        (statusMap.IGNORED || 0) +
        (statusMap.UNMATCHED || 0),
      matched: (statusMap.MATCHED || 0) + (statusMap.MANUAL || 0),
      toReview: statusMap.TO_REVIEW || 0,
      unmatched: statusMap.UNMATCHED || 0,
      ignored: statusMap.IGNORED || 0,
      pending: statusMap.PENDING || 0,
      bankBalance,
      ledgerBalance: ledgerSum,
      difference: Math.round((bankBalance - ledgerSum) * 100) / 100,
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('GET /api/reconciliation/summary error:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del summary' },
      { status: 500 }
    )
  }
}
