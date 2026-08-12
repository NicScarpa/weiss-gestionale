import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { money } from '@/lib/money'
import { liquiditaAlGiorno } from '@/lib/saldi'
import { prospettoCashFlow } from '@/lib/cashflow/prospetto'
import { eseguiControlli } from '@/lib/cashflow/controlli'
import { logger } from '@/lib/logger'

const filtri = z.object({
  anno: z.coerce.number().int().min(2000).max(2100),
})

/**
 * GET /api/cashflow/prospetto?anno=2026
 *
 * Il prospetto di cash flow a tre livelli, con i quattro controlli di
 * quadratura. La variazione reale che alimenta C1 viene dai saldi, non dal
 * prospetto: è proprio il confronto fra due fonti indipendenti a rendere il
 * controllo capace di dire qualcosa.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const { anno } = filtri.parse({
      anno: searchParams.get('anno') ?? new Date().getFullYear(),
    })

    const venueId = await getVenueId()

    // Il prospetto restituisce anche la materia prima con cui è stato
    // costruito — movimenti, mappa dei conti, cassa iniziale — e i controlli
    // girano su quella. Rileggerla qui significherebbe due query e, cosa
    // peggiore, due copie del commento che spiega perché la mappa dei conti
    // non si filtra per `isActive`: se le due copie divergessero, prospetto e
    // controlli lavorerebbero su insiemi di conti diversi.
    const [{ prospetto, movimenti, codicePerConto, cassaIniziale, contiSistema }, saldoFinale] =
      await Promise.all([
        prospettoCashFlow(venueId, anno),
        liquiditaAlGiorno(venueId, `${anno}-12-31`),
      ])

    const controlli = eseguiControlli({
      prospetto,
      movimenti,
      codicePerConto,
      variazioneReale: money(saldoFinale).minus(cassaIniziale),
      codiciVersamentoDiSistema: contiSistema.versamento,
      codiciSistemaFuoriProspetto: contiSistema.fuoriProspetto,
    })

    return NextResponse.json({ prospetto, controlli })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/cashflow/prospetto', error)
    return NextResponse.json({ error: 'Errore nel calcolo del prospetto' }, { status: 500 })
  }
}
