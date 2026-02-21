import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

// GET /api/cashflow/alerts - Lista alert attivi
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const venueId = await getVenueId()

  const alerts = await prisma.cashFlowAlert.findMany({
    where: {
      venueId,
      stato: 'ATTIVO',
    },
    orderBy: { dataPrevista: 'asc' },
    take: 50,
  })

  return NextResponse.json(alerts)
}

// POST /api/cashflow/alerts/[id]/resolve - Risolvi alert
// POST /api/cashflow/alerts/[id]/ignore - Ignora alert
