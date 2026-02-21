import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { reconcileVenueTransactions } from '@/lib/reconciliation'
import { reconcileSchema } from '@/lib/validations/reconciliation'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
// POST /api/reconciliation - Avvia riconciliazione automatica
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = reconcileSchema.parse(body)

    // Override venueId from session, not from body (IDOR prevention)
    const venueId = await getVenueId()

    const result = await reconcileVenueTransactions(venueId, {
      dateFrom: data.dateFrom ? new Date(data.dateFrom) : undefined,
      dateTo: data.dateTo ? new Date(data.dateTo) : undefined,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('POST /api/reconciliation error', error)
    return NextResponse.json(
      { error: 'Errore nella riconciliazione' },
      { status: 500 }
    )
  }
}
