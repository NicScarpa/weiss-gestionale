import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/prima-nota/[id]/verify
 * Toggle lo stato verified di una journal entry
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Recupera la entry corrente
    const current = await prisma.journalEntry.findUnique({
      where: { id: params.id },
      select: { verified: true, venueId: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    // Verifica autorizzazione sede
    if (session.user.role !== 'admin' && current.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    // Toggle verified
    const updated = await prisma.journalEntry.update({
      where: { id: params.id },
      data: { verified: !current.verified },
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
