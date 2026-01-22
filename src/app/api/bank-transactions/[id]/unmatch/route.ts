import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { unmatch } from '@/lib/reconciliation'

import { logger } from '@/lib/logger'
// POST /api/bank-transactions/[id]/unmatch - Annulla match
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    await unmatch(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('POST /api/bank-transactions/[id]/unmatch error', error)
    const message =
      error instanceof Error
        ? error.message
        : 'Errore nell\'annullare il match'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
