import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { ScheduleStatus } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'
import { ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import {
  bloccaScadenza,
  ricalcolaStatoSchedule,
  sommaPagamenti,
  TOLLERANZA_IMPORTI,
} from '@/lib/scadenzario/stato-schedule'

const updateStatusSchema = z.object({
  stato: z.nativeEnum(ScheduleStatus),
})

/**
 * Verifica che lo stato richiesto sia compatibile con i pagamenti registrati.
 *
 * Prima questa route scriveva lo stato e basta: si poteva dichiarare "pagata"
 * una scadenza con residuo aperto, e l'importo pagato restava indietro. Lo
 * stato di pagamento si deriva dai pagamenti; qui si può solo dichiarare ciò
 * che i pagamenti confermano, più i due contrassegni che gli importi non sanno
 * esprimere ('annullata' e 'scaduta').
 */
function motivoIncompatibilita(
  stato: ScheduleStatus,
  pagato: number,
  totale: number
): string | null {
  const saldata = pagato >= totale - TOLLERANZA_IMPORTI
  const residuo = Math.max(0, totale - pagato)

  switch (stato) {
    case ScheduleStatus.ANNULLATA:
      return null

    case ScheduleStatus.SCADUTA:
      return saldata ? 'La scadenza è interamente pagata: non può essere scaduta' : null

    case ScheduleStatus.PAGATA:
      return saldata
        ? null
        : `La scadenza ha ancora ${residuo.toFixed(2)} € da pagare: registra il pagamento ` +
            'invece di dichiararla pagata'

    case ScheduleStatus.PARZIALMENTE_PAGATA:
      if (saldata) return 'I pagamenti registrati coprono l\'intero importo: la scadenza è pagata'
      return pagato > TOLLERANZA_IMPORTI
        ? null
        : 'Nessun pagamento registrato: la scadenza non è parzialmente pagata'

    case ScheduleStatus.APERTA:
      return pagato > TOLLERANZA_IMPORTI
        ? `Sulla scadenza risultano ${pagato.toFixed(2)} € già pagati: non può tornare aperta`
        : null
  }
}

// PATCH /api/scadenzario/[id]/stato - Aggiorna solo stato scadenza
export async function PATCH(
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

    const body = await request.json()
    const { stato } = updateStatusSchema.parse(body)

    const esito = await prisma.$transaction(async (tx) => {
      const schedule = await bloccaScadenza(tx, id, venueId)
      if (!schedule) return { errore: 'not_found' } as const

      const { pagato } = await sommaPagamenti(tx, id)
      const motivo = motivoIncompatibilita(stato, pagato, Number(schedule.importoTotale))
      if (motivo) return { errore: 'incompatibile', motivo } as const

      // Lo stato richiesto entra come base della derivazione: il ricalcolo
      // tiene allineati importo pagato e date, e ha l'ultima parola.
      return { stato: (await ricalcolaStatoSchedule(tx, id, { statoDichiarato: stato }))! } as const
    })

    if ('errore' in esito) {
      if (esito.errore === 'not_found') {
        return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
      }
      return NextResponse.json({ error: esito.motivo }, { status: 422 })
    }

    // Il passaggio da/verso 'pagata' cambia la storia del fornitore, e con
    // essa la stima del suo ritardo tipico. Best-effort.
    if (
      (esito.stato.saldata || esito.stato.riaperta) &&
      esito.stato.tipo === 'passiva' &&
      esito.stato.supplierId
    ) {
      await ricalcolaStimeFornitore(esito.stato.supplierId, esito.stato.venueId)
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Schedule',
      entityId: id,
      newValues: { stato: esito.stato.stato },
    })

    return NextResponse.json({
      message: 'Stato aggiornato con successo',
      schedule: {
        id,
        stato: esito.stato.stato,
        importoTotale: esito.stato.importoTotale,
        importoPagato: esito.stato.importoPagato,
        importoResiduo: esito.stato.importoResiduo,
        dataPagamento: esito.stato.dataPagamento,
      },
    })
  } catch (error) {
    logger.error('Errore PATCH /api/scadenzario/[id]/stato', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento dello stato' },
      { status: 500 }
    )
  }
}
