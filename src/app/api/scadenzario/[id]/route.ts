import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus, SchedulePriority, ScheduleDocumentType } from '@/types/schedule'

const updateScheduleSchema = z.object({
  descrizione: z.string().min(1).optional(),
  stato: z.nativeEnum(ScheduleStatus).optional(),
  importoTotale: z.number().positive().optional(),
  dataScadenza: z.coerce.date().or(z.string()).optional(),
  dataEmissione: z.coerce.date().or(z.string()).optional(),
  dataPagamento: z.coerce.date().or(z.string()).optional(),
  tipoDocumento: z.nativeEnum(ScheduleDocumentType).optional(),
  numeroDocumento: z.string().optional(),
  riferimentoDocumento: z.string().optional(),
  controparteNome: z.string().optional(),
  controparteIban: z.string().optional(),
  supplierId: z.string().optional(),
  priorita: z.nativeEnum(SchedulePriority).optional(),
  metodoPagamento: z.enum(['bonifico', 'riba', 'sdd', 'carta', 'contanti', 'f24', 'altro']).optional(),
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

    // Verifica esistenza e permessi
    const existing = await prisma.schedule.findFirst({
      where: { id: id },
      select: { id: true, venueId: true },
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
    const updateData: Prisma.ScheduleUpdateInput = { ...validatedData }
    if (validatedData.dataPagamento && !validatedData.stato) {
      updateData.stato = ScheduleStatus.PAGATA
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

    return NextResponse.json({
      schedule: {
        ...schedule,
        importoResiduo: Number(schedule.importoTotale) - Number(schedule.importoPagato),
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
