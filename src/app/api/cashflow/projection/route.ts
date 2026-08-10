import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { money, toApi, type Money } from '@/lib/money'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente, movimentiPerGiorno, saldiAlGiorno } from '@/lib/saldi'

/**
 * GET /api/cashflow/projection — la curva del saldo nel tempo.
 *
 * Due difetti la rendevano peggio che inutile. I segni erano scambiati
 * (`entrata = creditAmount`, `uscita = debitAmount`): l'opposto della
 * convenzione del progetto, per cui su cassa e banca il dare è ciò che entra.
 * Un bonifico in uscita faceva salire la linea del saldo. E il progressivo
 * partiva da zero, mentre la card "Saldo Attuale" della stessa pagina partiva
 * dal saldo vero: due quote diverse per lo stesso denaro, a un centimetro di
 * distanza sullo schermo.
 *
 * Adesso i movimenti e l'apertura vengono entrambi da `@/lib/saldi`, come per
 * le card e per lo storico della prima nota.
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

    const [saldiFinali, movimenti] = await Promise.all([
      saldiAlGiorno(venueId, al),
      movimentiPerGiorno(venueId, { dal, al }),
    ])

    // Un punto per giorno: i due registri si sommano, perché la curva racconta
    // la liquidità complessiva. Più movimenti nello stesso giorno producevano
    // prima più punti sovrapposti sulla stessa ascissa.
    const perGiorno = new Map<string, { entrata: Money; uscita: Money }>()

    for (const riga of movimenti) {
      const corrente = perGiorno.get(riga.giorno) ?? { entrata: money(0), uscita: money(0) }

      perGiorno.set(riga.giorno, {
        entrata: corrente.entrata.plus(riga.dare),
        uscita: corrente.uscita.plus(riga.avere),
      })
    }

    // L'apertura si ricava all'indietro dal saldo di fine finestra: è la stessa
    // tecnica dello storico della prima nota, e per lo stesso motivo — chiedere
    // il saldo "del giorno prima" sbaglia quando la finestra si apre il 1°
    // gennaio, dove il giorno prima cade in un anno che il saldo iniziale non
    // copre.
    let saldo = Array.from(perGiorno.values()).reduce(
      (progressivo, { entrata, uscita }) => progressivo.minus(entrata).plus(uscita),
      money(saldiFinali.totalAvailable)
    )

    const projection: PuntoProiezione[] = []

    for (const giorno of Array.from(perGiorno.keys()).sort()) {
      const { entrata, uscita } = perGiorno.get(giorno)!
      saldo = saldo.plus(entrata).minus(uscita)

      projection.push({
        data: giorno,
        saldo: toApi(saldo),
        entrata: toApi(entrata),
        uscita: toApi(uscita),
      })
    }

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
