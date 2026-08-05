import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

/**
 * PATCH /api/prima-nota/[id]/verify
 * Toggle lo stato verified di una journal entry
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Recupera la entry corrente
    const current = await prisma.journalEntry.findUnique({
      where: { id: id },
      select: { verified: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    // Toggle verified
    const updated = await prisma.journalEntry.update({
      where: { id: id },
      data: { verified: !current.verified },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'JournalEntry',
      entityId: id,
      newValues: { verified: updated.verified },
    })

    return NextResponse.json({
      id: updated.id,
      verified: updated.verified,
    })
  } catch (error) {
    console.error('Errore PATCH /api/prima-nota/[id]/verify', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento dello stato' },
      { status: 500 }
    )
  }
}
