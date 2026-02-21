import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findMatchCandidates } from '@/lib/reconciliation'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
// GET /api/bank-transactions/[id] - Dettaglio transazione con candidati match
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id, venueId },
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
            account: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        importBatch: {
          select: {
            id: true,
            filename: true,
            source: true,
            importedAt: true,
          },
        },
      },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transazione non trovata' },
        { status: 404 }
      )
    }

    // Se la transazione non è ancora matchata, cerca candidati
    let matchCandidates: Awaited<ReturnType<typeof findMatchCandidates>> = []
    if (
      transaction.status === 'PENDING' ||
      transaction.status === 'UNMATCHED' ||
      transaction.status === 'TO_REVIEW'
    ) {
      matchCandidates = await findMatchCandidates(
        {
          id: transaction.id,
          transactionDate: transaction.transactionDate,
          description: transaction.description,
          amount: Number(transaction.amount),
        },
        transaction.venueId,
        10
      )
    }

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      balanceAfter: transaction.balanceAfter
        ? Number(transaction.balanceAfter)
        : null,
      matchConfidence: transaction.matchConfidence
        ? Number(transaction.matchConfidence)
        : null,
      matchedEntry: transaction.matchedEntry
        ? {
            ...transaction.matchedEntry,
            debitAmount: transaction.matchedEntry.debitAmount
              ? Number(transaction.matchedEntry.debitAmount)
              : null,
            creditAmount: transaction.matchedEntry.creditAmount
              ? Number(transaction.matchedEntry.creditAmount)
              : null,
          }
        : null,
      matchCandidates,
    })
  } catch (error) {
    logger.error('GET /api/bank-transactions/[id] error', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della transazione' },
      { status: 500 }
    )
  }
}

// DELETE /api/bank-transactions/[id] - Elimina transazione
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id, venueId },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transazione non trovata' },
        { status: 404 }
      )
    }

    // Non permettere eliminazione di transazioni già riconciliate
    if (transaction.status === 'MATCHED' || transaction.status === 'MANUAL') {
      return NextResponse.json(
        { error: 'Non è possibile eliminare una transazione già riconciliata' },
        { status: 400 }
      )
    }

    await prisma.bankTransaction.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('DELETE /api/bank-transactions/[id] error', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della transazione' },
      { status: 500 }
    )
  }
}
