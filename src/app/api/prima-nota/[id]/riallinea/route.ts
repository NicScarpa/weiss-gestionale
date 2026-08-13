import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { imputazioniDivergenti, riallineaFette } from '@/lib/invoices/riallineamento'

/**
 * POST /api/prima-nota/[id]/riallinea
 *
 * Cancella le fette ereditate divergenti del movimento e le rigenera dalle
 * imputazioni correnti della fattura (Task 7, spec sezione 2). Risponde 409
 * se non c'è nessuna divergenza da riallineare: riallineare qualcosa che è
 * già allineato deve essere un errore esplicito, non un no-op silenzioso.
 */
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
    const venueId = await getVenueId()

    const movimento = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      select: { id: true },
    })
    if (!movimento) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    const divergenza = await imputazioniDivergenti(id)
    if (!divergenza.divergente) {
      return NextResponse.json(
        { error: 'Il movimento non ha imputazioni divergenti da riallineare' },
        { status: 409 }
      )
    }

    const fette = await prisma.$transaction((tx) => riallineaFette(tx, id, session.user.id))

    return NextResponse.json({
      fette,
      invoiceId: divergenza.invoiceId,
      message: 'Fette riallineate alle imputazioni correnti della fattura',
    })
  } catch (error) {
    logger.error('Errore POST /api/prima-nota/[id]/riallinea', error)
    return NextResponse.json(
      { error: 'Errore nel riallineamento delle fette' },
      { status: 500 }
    )
  }
}
