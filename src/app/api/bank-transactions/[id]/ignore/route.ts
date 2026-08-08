import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ignoreTransaction } from '@/lib/reconciliation'

import { logger } from '@/lib/logger'
// POST /api/bank-transactions/[id]/ignore - Ignora transazione
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    const ignorata = await ignoreTransaction(id, session.user.id)

    if (!ignorata) {
      return NextResponse.json({ error: 'Transazione non trovata' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('POST /api/bank-transactions/[id]/ignore error', error)
    const message =
      error instanceof Error
        ? error.message
        : 'Errore nell\'ignorare la transazione'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
