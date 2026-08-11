import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { seedCategorieCashFlow } from '@/lib/cashflow/seed-categorie'
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
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const esito = await seedCategorieCashFlow(venueId, session.user.id)

    return NextResponse.json({
      message:
        `Installate ${esito.famiglieCreate} famiglie e ${esito.sottogruppiCreati} ` +
        `sottogruppi, ${esito.mappingCreati} conti mappati.`,
      ...esito,
    })
  } catch (error) {
    logger.error('Errore POST /api/budget-categories/seed', error)
    return NextResponse.json(
      { error: "Errore nell'installazione delle categorie" },
      { status: 500 }
    )
  }
}
