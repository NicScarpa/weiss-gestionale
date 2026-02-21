import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

// GET /api/cashflow/projection - Genera proiezione cash flow
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const venueId = await getVenueId()

  const from = searchParams.get('from') || new Date().toISOString().split('T')[0]
  const days = parseInt(searchParams.get('days') || '30')

  const toDate = new Date(from)
  toDate.setDate(toDate.getDate() + parseInt(searchParams.get('days') || '30'))

  // Recupera movimenti reali + scadenze
  const movements = await prisma.journalEntry.findMany({
    where: {
      venueId,
      date: { gte: new Date(from), lte: toDate },
      hiddenAt: null,
    },
    orderBy: { date: 'asc' },
  })

  // Calcola running balance
  let saldo = 0
  const projection: Array<{
    data: string
    saldo: number
    entrata: number
    uscita: number
  }> = []

  for (const movement of movements) {
    const entrata = movement.creditAmount?.toNumber() || 0
    const uscita = movement.debitAmount?.toNumber() || 0
    saldo += entrata - uscita

    projection.push({
      data: movement.date.toISOString().split('T')[0],
      saldo,
      entrata,
      uscita,
    })
  }

  return NextResponse.json(projection)
}
