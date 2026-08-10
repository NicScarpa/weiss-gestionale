import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { SchedulePriority, ScheduleDocumentType } from '@/types/schedule'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import {
  bloccaScadenza,
  ricalcolaStatoSchedule,
  sommaPagamenti,
  TOLLERANZA_IMPORTI,
} from '@/lib/scadenzario/stato-schedule'

/**
 * Campi che descrivono lo stato di pagamento: si derivano dai pagamenti
 * registrati e non si scrivono da qui. Questa PATCH poteva dichiarare una
 * scadenza pagata senza toccare l'importo pagato — da cui scadenze "pagate"
 * con residuo positivo — e scriveva una data di pagamento a piacere, che poi
 * inquinava la stima del ritardo del fornitore.
 */
const CAMPI_DERIVATI = ['stato', 'dataPagamento', 'importoPagato'] as const

const ROUTE_PER_CAMPO: Record<(typeof CAMPI_DERIVATI)[number], string> = {
  stato: 'PATCH /api/scadenzario/[id]/stato',
  dataPagamento: 'POST /api/scadenzario/[id]/pagamenti',
  importoPagato: 'POST /api/scadenzario/[id]/pagamenti',
}

/**
 * Il verso della scadenza non si cambia mai.
 *
 * `tipo` non è nello schema qui sotto, quindi finiva scartato in silenzio: la
 * schermata di modifica lo mostra in un menu attivo, l'utente poteva sceglierlo,
 * salvare, e ritrovarsi la scadenza identica a prima senza sapere perché.
 *
 * Si rifiuta il CAMBIO e non la presenza del campo, e la differenza non è
 * formale: la schermata di modifica rimanda l'intero oggetto — invia un
 * `CreateScheduleInput`, che ha `tipo` obbligatorio, popolato col valore
 * corrente — quindi rifiutare la sola presenza renderebbe impossibile
 * modificare perfino la descrizione di una scadenza qualsiasi.
 *
 * (Il gemello `CAMPI_CONGELATI` in `pagamenti/[id]/route.ts` guarda invece la
 * sola presenza: là il congelamento scatta solo dopo la registrazione in prima
 * nota, qui il divieto è permanente e il campo arriva sempre. Stessa idea, due
 * condizioni diverse.)
 */
const CAMPI_IMMUTABILI = ['tipo'] as const

const MOTIVO_IMMUTABILE: Record<(typeof CAMPI_IMMUTABILI)[number], string> = {
  tipo:
    'Il verso di una scadenza non si cambia: attiva e passiva stanno su lati opposti dei ' +
    'conti, e su una scadenza già riconciliata sposterebbe denaro già registrato. ' +
    'Annulla questa scadenza e creane una nuova nel verso giusto.',
}

const updateScheduleSchema = z.object({
  descrizione: z.string().min(1).optional(),
  importoTotale: z.number().positive().optional(),
  dataScadenza: z.coerce.date().or(z.string()).optional(),
  dataEmissione: z.coerce.date().or(z.string()).optional(),
  dataAttesa: z.coerce.date().or(z.string()).nullable().optional(),
  tipoDocumento: z.nativeEnum(ScheduleDocumentType).optional(),
  numeroDocumento: z.string().optional(),
  riferimentoDocumento: z.string().optional(),
  controparteNome: z.string().optional(),
  controparteIban: z.string().optional(),
  supplierId: z.string().optional(),
  priorita: z.nativeEnum(SchedulePriority).optional(),
  metodoPagamento: z.enum(['bonifico', 'riba', 'sdd', 'carta', 'contanti', 'f24', 'assegno', 'bollettino', 'credito_fiscale', 'senza_incasso', 'altro']).optional(),
  isRicorrente: z.boolean().optional(),
  ricorrenzaTipo: z.enum(['settimanale', 'mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale']).nullable().optional(),
  ricorrenzaFine: z.coerce.date().or(z.string()).nullable().optional(),
  ricorrenzaAttiva: z.boolean().optional(),
  note: z.string().optional(),
})

// GET /api/scadenzario/[id] - Dettaglio scadenza
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const schedule = await prisma.schedule.findFirst({
      where: { id: id },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            vatNumber: true,
            iban: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        payments: {
          orderBy: { dataPagamento: 'desc' },
        },
        ricorrenzaParent: {
          select: {
            id: true,
            descrizione: true,
          },
        },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    return NextResponse.json({
      schedule: {
        ...schedule,
        importoResiduo: Number(schedule.importoTotale) - Number(schedule.importoPagato),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della scadenza' },
      { status: 500 }
    )
  }
}

// PATCH /api/scadenzario/[id] - Aggiorna scadenza
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Verifica esistenza e permessi
    const existing = await prisma.schedule.findFirst({
      where: { id: id },
      select: { id: true, venueId: true, tipo: true, stato: true, dataAttesaSource: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const body = await request.json()

    const derivatiRichiesti = CAMPI_DERIVATI.filter((campo) => campo in body)
    if (derivatiRichiesti.length > 0) {
      return NextResponse.json(
        {
          error:
            'Stato e importo pagato si derivano dai pagamenti registrati e non si ' +
            'modificano da qui',
          campi: derivatiRichiesti.map((campo) => ({ campo, usare: ROUTE_PER_CAMPO[campo] })),
        },
        { status: 400 }
      )
    }

    // Un campo immutabile rimandato col valore che ha già non è un cambio:
    // l'interfaccia rispedisce sempre l'oggetto intero, e trattarlo come
    // tentativo di modifica bloccherebbe ogni salvataggio.
    const immutabiliCambiati = CAMPI_IMMUTABILI.filter(
      (campo) => campo in body && body[campo] !== existing[campo]
    )
    if (immutabiliCambiati.length > 0) {
      return NextResponse.json(
        {
          error: immutabiliCambiati.map((campo) => MOTIVO_IMMUTABILE[campo]).join(' '),
          campi: immutabiliCambiati,
        },
        { status: 400 }
      )
    }

    const validatedData = updateScheduleSchema.parse(body)

    // Se fornitore specificato, verififica esistenza
    if (validatedData.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: validatedData.supplierId },
      })
      if (!supplier) {
        return NextResponse.json({ error: 'Fornitore non trovato' }, { status: 404 })
      }
    }

    const { dataAttesa: dataAttesaInput, ...datiScadenza } = validatedData
    const updateData: Prisma.ScheduleUpdateInput = { ...datiScadenza }

    if (dataAttesaInput !== undefined) {
      if (existing.tipo !== 'passiva') {
        return NextResponse.json(
          { error: 'La data attesa si imposta solo sulle scadenze passive' },
          { status: 400 }
        )
      }
      if (existing.stato === 'pagata' || existing.stato === 'annullata') {
        return NextResponse.json(
          { error: 'La data attesa non si modifica su una scadenza chiusa' },
          { status: 400 }
        )
      }
      if (existing.dataAttesaSource === 'riconciliazione') {
        return NextResponse.json(
          { error: 'La data attesa è riallineata al movimento riconciliato: non si sovrascrive' },
          { status: 400 }
        )
      }
      if (dataAttesaInput === null) {
        // Svuotare = tornare alla stima automatica (ricalcolo dopo l'update)
        updateData.dataAttesa = null
        updateData.dataAttesaSource = null
      } else {
        updateData.dataAttesa = new Date(dataAttesaInput)
        updateData.dataAttesaSource = 'manuale'
      }
    }

    // L'aggiornamento e il ricalcolo che ne consegue stanno nella stessa
    // transazione, con la scadenza bloccata: abbassare l'importo totale può
    // saldarla, e fra la verifica del residuo e la scrittura non deve poter
    // entrare un pagamento.
    const esito = await prisma.$transaction(async (tx) => {
      const bloccata = await bloccaScadenza(tx, id)
      if (!bloccata) return { errore: 'not_found' } as const

      if (validatedData.importoTotale !== undefined) {
        const { pagato } = await sommaPagamenti(tx, id)
        if (validatedData.importoTotale < pagato - TOLLERANZA_IMPORTI) {
          return {
            errore: 'importo_sotto_pagato',
            motivo:
              `Sulla scadenza risultano ${pagato.toFixed(2)} € già pagati: l'importo totale ` +
              'non può scendere sotto quella cifra',
          } as const
        }
      }

      const schedule = await tx.schedule.update({
        where: { id: id },
        data: updateData,
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          payments: { orderBy: { dataPagamento: 'desc' }, take: 5 },
        },
      })

      // Cambiare l'importo totale sposta la soglia del saldo: la scadenza può
      // essere diventata pagata (o non esserlo più) senza che sia entrato o
      // uscito un centesimo.
      const stato =
        validatedData.importoTotale !== undefined
          ? await ricalcolaStatoSchedule(tx, id)
          : null

      return { schedule, stato } as const
    })

    if ('errore' in esito) {
      if (esito.errore === 'not_found') {
        return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
      }
      return NextResponse.json({ error: esito.motivo }, { status: 422 })
    }

    const schedule = esito.schedule

    // Se la PATCH ha saldato la scadenza, la storia del fornitore è cambiata:
    // le stime delle sue altre scadenze aperte si aggiornano (stesso principio
    // della route pagamenti). Best-effort: non blocca mai l'aggiornamento
    if (
      (esito.stato?.saldata || esito.stato?.riaperta) &&
      schedule.tipo === 'passiva' &&
      schedule.supplierId
    ) {
      await ricalcolaStimeFornitore(schedule.supplierId, existing.venueId)
    }

    // La stima si riapplica se la data attesa è stata svuotata, o se è
    // cambiata la scadenza contrattuale — o il fornitore — di una scadenza
    // non gestita a mano
    const daRistimare =
      dataAttesaInput === null ||
      ((validatedData.dataScadenza !== undefined || validatedData.supplierId !== undefined) &&
        dataAttesaInput === undefined &&
        (existing.dataAttesaSource === null || existing.dataAttesaSource === 'stima'))

    if (daRistimare) {
      await applicaStimaSuScadenza(id, existing.venueId)
    }

    const finale = daRistimare
      ? (await prisma.schedule.findUnique({
          where: { id },
          include: {
            supplier: { select: { id: true, name: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            payments: { orderBy: { dataPagamento: 'desc' }, take: 5 },
          },
        })) ?? schedule
      : schedule

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Schedule',
      entityId: id,
    })

    return NextResponse.json({
      schedule: {
        ...finale,
        importoResiduo: Number(finale.importoTotale) - Number(finale.importoPagato),
      },
    })
  } catch (error) {
    logger.error('Errore PATCH /api/scadenzario/[id]', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della scadenza' },
      { status: 500 }
    )
  }
}

// DELETE /api/scadenzario/[id] - Elimina scadenza
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Cancellazione logica: lo stato passa ad ANNULLATA. Anche questo percorso
    // passa dal ricalcolo, perché annullare una rata cambia il conto delle rate
    // aperte della fattura: senza, la fattura resterebbe indietro rispetto alle
    // sue scadenze.
    const esito = await prisma.$transaction(async (tx) =>
      ricalcolaStatoSchedule(tx, id, { statoDichiarato: 'annullata' })
    )

    if (!esito) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    // Una rata annullata esce dalla storia dei pagamenti del fornitore
    if (esito.riaperta && esito.tipo === 'passiva' && esito.supplierId) {
      await ricalcolaStimeFornitore(esito.supplierId, esito.venueId)
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'Schedule',
      entityId: id,
    })

    return NextResponse.json({
      message: 'Scadenza annullata con successo',
      schedule: {
        id,
        stato: esito.stato,
        importoTotale: esito.importoTotale,
        importoPagato: esito.importoPagato,
        importoResiduo: esito.importoResiduo,
      },
    })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della scadenza' },
      { status: 500 }
    )
  }
}
