import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente } from '@/lib/saldi'
import { serieProiettata } from '@/lib/previsionale/leggi'

/**
 * GET /api/cashflow/projection — la curva del saldo nel tempo.
 *
 * Storicamente sommava solo i movimenti già registrati in prima nota: non
 * vedeva le scadenze aperte né le ricorrenze, la stessa domanda a cui
 * rispondevano — con basi diverse — `/api/scadenzario/saldo-scalare` e
 * `/api/dashboard/forecast` (vedi il commento in testa a
 * `src/lib/previsionale/proietta.ts`). Adesso proietta dalla stessa fonte
 * unica delle altre due, `serieProiettata`: le tre curve, sulla stessa
 * finestra, coincidono.
 *
 * I nomi dei campi della risposta restano quelli di sempre (`data`, `saldo`,
 * `entrata`, `uscita`): `CashFlowChart` li conosce già, e non è questo il
 * momento di toccarlo. `proietta` restituisce `giorno`/`entrate`/`uscite` —
 * la mappatura qui sotto non è ridondante, è ciò che tiene il contratto della
 * rotta stabile mentre la fonte cambia sotto.
 *
 * `proietta` è densa per definizione: un punto per ogni giorno della
 * finestra, anche senza flussi (serve a `saldo-scalare`, che deve poter
 * disegnare una linea piatta). Questa rotta, da prima di questo refactor, è
 * sparsa: un punto solo nei giorni in cui qualcosa si muove davvero — lo
 * verificano i test già in `__tests__/projection.itest.ts` con asserzioni
 * puntuali su `punti.at(-1)` e sulla lunghezza dell'array. Il filtro qui
 * sotto non è un dettaglio: è ciò che mantiene quel contratto mentre la fonte
 * dei dati cambia sotto.
 */

const giornoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Data attesa nel formato yyyy-MM-dd')
  .transform((valore) => valore.slice(0, 10))

const filtriSchema = z.object({
  from: giornoSchema.optional(),
  // Un tetto c'è perché la finestra decide quante righe si leggono: senza,
  // `days=100000` diventa una scansione dell'intera prima nota.
  days: z.coerce.number().int().min(1).max(366).default(30),
})

export interface PuntoProiezione {
  /** Giorno civile ('yyyy-MM-dd'). */
  data: string
  /** Saldo di cassa e banca a fine giornata. */
  saldo: number
  entrata: number
  uscita: number
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const filtri = filtriSchema.parse({
      from: searchParams.get('from') || undefined,
      days: searchParams.get('days') ?? undefined,
    })

    const venueId = await getVenueId()
    const dal = filtri.from ?? giornoCorrente()
    const al = new Date(toDateOnlyUtc(dal).getTime() + filtri.days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const serie = await serieProiettata(venueId, dal, al)

    const projection: PuntoProiezione[] = serie
      .filter((punto) => punto.entrate !== 0 || punto.uscite !== 0)
      .map((punto) => ({
        data: punto.giorno,
        saldo: punto.saldo,
        entrata: punto.entrate,
        uscita: punto.uscite,
      }))

    return NextResponse.json(projection)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/cashflow/projection', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo della proiezione' },
      { status: 500 }
    )
  }
}
