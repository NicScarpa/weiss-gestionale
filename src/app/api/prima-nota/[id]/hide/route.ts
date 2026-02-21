import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/prima-nota/[id]/hide
 * Soft-hide: nasconde una journal entry (imposta hiddenAt)
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
      select: { hiddenAt: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    // Toggle hidden
    const updated = await prisma.journalEntry.update({
      where: { id: id },
      data: { hiddenAt: current.hiddenAt ? null : new Date() },
    })

    return NextResponse.json({
      id: updated.id,
      hiddenAt: updated.hiddenAt,
    })
  } catch (error) {
    console.error('Errore PATCH /api/prima-nota/[id]/hide', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento' },
      { status: 500 }
    )
  }
}
