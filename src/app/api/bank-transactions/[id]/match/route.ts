import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { manualMatch } from '@/lib/reconciliation'
import { matchTransactionSchema } from '@/lib/validations/reconciliation'

// POST /api/bank-transactions/[id]/match - Match manuale con movimento
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
    const body = await request.json()
    const { journalEntryId } = matchTransactionSchema.parse(body)

    await manualMatch(id, journalEntryId, session.user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/bank-transactions/[id]/match error:', error)
    const message =
      error instanceof Error ? error.message : 'Errore nel match della transazione'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
