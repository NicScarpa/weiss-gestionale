import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { confirmMatch } from '@/lib/reconciliation'

// POST /api/bank-transactions/[id]/confirm - Conferma match suggerito
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

    await confirmMatch(id, session.user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/bank-transactions/[id]/confirm error:', error)
    const message =
      error instanceof Error
        ? error.message
        : 'Errore nella conferma del match'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
