import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { money } from '@/lib/money'
import { liquiditaAlGiorno } from '@/lib/saldi'
import { prisma } from '@/lib/prisma'
import { prospettoCashFlow } from '@/lib/cashflow/prospetto'
import { movimentiCashFlow } from '@/lib/cashflow/movimenti'
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

    const [prospetto, movimenti, saldoIniziale, saldoFinale, conti] = await Promise.all([
      prospettoCashFlow(venueId, anno),
      movimentiCashFlow(venueId, anno),
      liquiditaAlGiorno(venueId, `${anno - 1}-12-31`),
      liquiditaAlGiorno(venueId, `${anno}-12-31`),
      // Tutti i conti, attivi e non. In questo progetto `isActive: false` è il
      // soft-delete dei conti **che hanno movimenti** (vedi il DELETE in
      // src/app/api/accounts/route.ts): filtrarli farebbe sparire dai controlli
      // proprio lo storico che devono sorvegliare, e C4 segnalerebbe come
      // ignoti dei conti perfettamente legittimi. Stessa scelta, e stesso
      // motivo, di `codiciDeiConti()` in prospetto.ts.
      prisma.account.findMany({ select: { id: true, code: true } }),
    ])

    const controlli = eseguiControlli({
      prospetto,
      movimenti,
      codicePerConto: new Map(conti.map((c) => [c.id, c.code])),
      variazioneReale: money(saldoFinale).minus(money(saldoIniziale)),
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
