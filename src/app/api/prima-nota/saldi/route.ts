import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { saldiAlGiorno } from '@/lib/saldi'

/**
 * GET /api/prima-nota/saldi — saldi correnti di cassa e banca.
 *
 * Il calcolo sta in `@/lib/saldi`: qui resta solo l'autorizzazione e la forma
 * della risposta. La risposta è un array di una sola voce perché così la
 * consumano i client esistenti; l'applicazione gestisce una sede sola (vedi
 * `@/lib/venue`), quindi non c'è un secondo elemento da attendersi.
 */
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
    const saldi = await saldiAlGiorno(venueId)

    return NextResponse.json({ data: [saldi] })
  } catch (error) {
    logger.error('Errore GET /api/prima-nota/saldi', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei saldi' },
      { status: 500 }
    )
  }
}
