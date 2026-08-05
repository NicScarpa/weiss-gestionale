import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { ScheduleStatus, SchedulePriority, ScheduleDocumentType } from '@/types/schedule'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'

const updateScheduleSchema = z.object({
  descrizione: z.string().min(1).optional(),
  stato: z.nativeEnum(ScheduleStatus).optional(),
  importoTotale: z.number().positive().optional(),
  dataScadenza: z.coerce.date().or(z.string()).optional(),
  dataEmissione: z.coerce.date().or(z.string()).optional(),
  dataPagamento: z.coerce.date().or(z.string()).optional(),
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

    // Aggiorna automaticamente stato se pagato interamente
    const { dataAttesa: dataAttesaInput, ...datiScadenza } = validatedData
    const updateData: Prisma.ScheduleUpdateInput = { ...datiScadenza }
    if (validatedData.dataPagamento && !validatedData.stato) {
      updateData.stato = ScheduleStatus.PAGATA
    }

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

    const schedule = await prisma.schedule.update({
      where: { id: id },
      data: updateData,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
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
          take: 5,
        },
      },
    })

    // Se la PATCH ha saldato la scadenza, la storia del fornitore è cambiata:
    // le stime delle sue altre scadenze aperte si aggiornano (stesso principio
    // della route pagamenti). Best-effort: non blocca mai l'aggiornamento
    const diventataPagata = schedule.stato === 'pagata' && existing.stato !== 'pagata'
    if (diventataPagata && schedule.tipo === 'passiva' && schedule.supplierId) {
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

    // Verifica esistenza e permessi
    const existing = await prisma.schedule.findFirst({
      where: { id: id },
      select: { id: true, venueId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    // Soft delete - aggiorna stato ad ANNULLATA
    const schedule = await prisma.schedule.update({
      where: { id: id },
      data: { stato: 'annullata' },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'Schedule',
      entityId: id,
    })

    return NextResponse.json({
      message: 'Scadenza annullata con successo',
      schedule,
    })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della scadenza' },
      { status: 500 }
    )
  }
}
