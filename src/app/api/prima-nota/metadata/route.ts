import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * GET /api/prima-nota/metadata
 * Restituisce totali aggregati per filtri e statistiche
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = session.user.venueId!

    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Prisma.JournalEntryWhereInput = { venueId }

    if (dateFrom || dateTo) {
      where.date = {} as any
      if (dateFrom) {
        where.date.gte = new Date(dateFrom)
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo)
      }
    }

    // Query aggregazioni parallele
    const [
      totalEntries,
      verifiedCount,
      unverifiedCount,
      categorizedCount,
      uncategorizedCount,
      hiddenCount,
      totalDebit,
      totalCredit,
    ] = await Promise.all([
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.count({ where: { ...where, verified: true } }),
      prisma.journalEntry.count({ where: { ...where, verified: false } }),
      prisma.journalEntry.count({ where: { ...where, budgetCategoryId: { not: null } } }),
      prisma.journalEntry.count({ where: { ...where, budgetCategoryId: null } }),
      prisma.journalEntry.count({ where: { ...where, hiddenAt: { not: null } } }),
      prisma.journalEntry.aggregate({
        where: { ...where, debitAmount: { not: null } },
        _sum: { debitAmount: true },
      }),
      prisma.journalEntry.aggregate({
        where: { ...where, creditAmount: { not: null } },
        _sum: { creditAmount: true },
      }),
    ])

    return NextResponse.json({
      metadata: {
        totalEntries,
        verifiedCount,
        unverifiedCount,
        categorizedCount,
        uncategorizedCount,
        hiddenCount,
        totalDebit: Number(totalDebit._sum.debitAmount || 0),
        totalCredit: Number(totalCredit._sum.creditAmount || 0),
        balance: Number(totalDebit._sum.debitAmount || 0) - Number(totalCredit._sum.creditAmount || 0),
      },
    })
  } catch (error) {
    console.error('Errore GET /api/prima-nota/metadata', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei metadati' },
      { status: 500 }
    )
  }
}
