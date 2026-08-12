import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import {
  MigrazioneNonApplicataError,
  seedCategorieCashFlow,
} from '@/lib/cashflow/seed-categorie'
import { logger } from '@/lib/logger'

/**
 * POST /api/budget-categories/seed — installa le categorie della
 * riclassificazione cash flow.
 *
 * Sostituisce il template generico (Food Cost, Costi Fissi, Ricavi Bar…) che
 * non era allineato né al piano dei conti v4 né al prospetto. Le vecchie
 * categorie vengono disattivate, non cancellate: ci sono movimenti che le
 * citano.
 */
export async function POST() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const esito = await seedCategorieCashFlow(venueId, session.user.id)

    // Un rerun che non cambia nulla non deve annunciare installazioni: il
    // messaggio riporta solo ciò che è successo davvero in questa chiamata.
    const parti: string[] = []
    if (esito.famiglieCreate > 0 || esito.sottogruppiCreati > 0) {
      parti.push(
        `create ${esito.famiglieCreate} famiglie e ${esito.sottogruppiCreati} sottogruppi`
      )
    }
    if (esito.famiglieAggiornate > 0 || esito.sottogruppiAggiornati > 0) {
      parti.push(
        `aggiornate ${esito.famiglieAggiornate} famiglie e ${esito.sottogruppiAggiornati} sottogruppi`
      )
    }
    if (esito.mappingCreati > 0) {
      parti.push(`${esito.mappingCreati} conti mappati`)
    }
    if (esito.mappingRiassegnati > 0) {
      parti.push(`${esito.mappingRiassegnati} mappature riportate sulla categoria prevista`)
    }

    const message =
      parti.length > 0
        ? parti.join('; ') + '.'
        : 'Nessuna modifica: la struttura era già installata e aggiornata.'

    return NextResponse.json({ message, ...esito })
  } catch (error) {
    // Non è un guasto: manca un passo di installazione, e il messaggio dice
    // quale. Va restituito com'è, o l'operatore legge "errore" e non sa cosa
    // fare — mentre la cosa da fare è una sola, ed è scritta lì dentro.
    if (error instanceof MigrazioneNonApplicataError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    logger.error('Errore POST /api/budget-categories/seed', error)
    return NextResponse.json(
      { error: "Errore nell'installazione delle categorie" },
      { status: 500 }
    )
  }
}
