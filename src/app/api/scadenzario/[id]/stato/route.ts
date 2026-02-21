import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus } from '@/types/schedule'

const updateStatusSchema = z.object({
  stato: z.nativeEnum(ScheduleStatus),
})

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

    const { id } = await params

    // Verifica esistenza e permessi
    const existing = await prisma.schedule.findFirst({
      select: { id: true, venueId: true, importoTotale: true, importoPagato: true, dataPagamento: true, stato: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const body = await request.json()
    const { stato } = updateStatusSchema.parse(body)

    // Se si passa a PAGATA, imposta dataPagamento a oggi
    const updateData: Prisma.ScheduleUpdateInput = { stato }
    if (stato === ScheduleStatus.PAGATA && !existing.dataPagamento) {
      updateData.dataPagamento = new Date()
    }

    // Se si passa a PARZIALMENTE_PAGATA e non lo era già
    if (stato === ScheduleStatus.PARZIALMENTE_PAGATA && existing.stato !== ScheduleStatus.PARZIALMENTE_PAGATA) {
      // Non cambiamo dataPagamento - verrà aggiornata dai pagamenti parziali
    }

    // Se si passa a SCADUTA (data oggi) e non è pagata
    if (stato === ScheduleStatus.SCADUTA && !existing.dataPagamento) {
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      updateData.dataPagamento = today
    }

    const schedule = await prisma.schedule.update({
      where: { id: id },
      data: updateData,
    })

    return NextResponse.json({
      message: 'Stato aggiornato con successo',
      schedule: {
        ...schedule,
        importoResiduo: Number(schedule.importoTotale) - Number(schedule.importoPagato),
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
