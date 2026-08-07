import { NextResponse } from 'next/server'
import type { PaymentStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'

/**
 * GET /api/pagamenti/summary — quanti pagamenti ci sono, per stato.
 *
 * Il conteggio passa da Prisma e non più da SQL grezzo. La query precedente
 * castava l'id della sede a `uuid` — gli id di questo schema sono cuid, cioè
 * testo, e il cast faceva fallire l'intera richiesta — e leggendo la tabella
 * direttamente scavalcava il filtro sui pagamenti cancellati, che tornavano nei
 * totali.
 */

/**
 * Dal nome dello stato alla chiave della risposta. La corrispondenza è scritta
 * per esteso perché `DA_APPROVARE.toLowerCase()` non è `daApprovare`: la
 * conversione automatica di prima lasciava quel contatore fermo a zero per
 * sempre.
 */
const CHIAVE_PER_STATO: Record<PaymentStatus, string> = {
  BOZZA: 'bozza',
  DA_APPROVARE: 'daApprovare',
  DISPOSTO: 'disposto',
  COMPLETATO: 'completato',
  FALLITO: 'fallito',
  ANNULLATO: 'annullato',
}

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()

    const perStato = await prisma.payment.groupBy({
      by: ['stato'],
      where: { venueId },
      _count: { _all: true },
    })

    const summary = Object.fromEntries(
      Object.values(CHIAVE_PER_STATO).map((chiave) => [chiave, 0])
    ) as Record<string, number>

    for (const riga of perStato) {
      summary[CHIAVE_PER_STATO[riga.stato]] = riga._count._all
    }

    return NextResponse.json(summary)
  } catch (error) {
    logger.error('Errore GET /api/pagamenti/summary', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del riepilogo pagamenti' },
      { status: 500 }
    )
  }
}
