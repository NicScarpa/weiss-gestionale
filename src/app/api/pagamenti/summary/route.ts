import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/pagamenti/summary - Conteggi per stato
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const venueId = session.user.venueId!

  const [countByState] = await prisma.$queryRaw`
    SELECT
      stato,
      COUNT(*) as count
    FROM payments
    WHERE venue_id = ${venueId}::uuid
    GROUP BY stato
  ` as Array<{ stato: string; count: bigint }>

  const summary = {
    bozza: 0,
    daApprovare: 0,
    disposto: 0,
    completato: 0,
    fallito: 0,
    annullato: 0,
  }

  for (const row of countByState) {
    summary[row.stato.toLowerCase() as keyof typeof summary] = Number(row.count)
  }

  return NextResponse.json(summary)
}
