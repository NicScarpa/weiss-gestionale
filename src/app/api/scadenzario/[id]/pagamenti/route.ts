import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus } from '@/types/schedule'

const createPaymentSchema = z.object({
  importo: z.number().positive('Importo deve essere positivo'),
  dataPagamento: z.coerce.date().or(z.string()),
  metodo: z.enum(['bonifico', 'riba', 'sdd', 'carta', 'contanti', 'f24', 'altro']).optional(),
  riferimento: z.string().optional(),
  note: z.string().optional(),
})

// GET /api/scadenzario/[id]/pagamenti - Lista pagamenti di una scadenza
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

    // Verifica esistenza scadenza
    const schedule = await prisma.schedule.findFirst({
      where: { id: id },
      select: { id: true, venueId: true },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const payments = await prisma.schedulePayment.findMany({
      where: { scheduleId: id },
      orderBy: { dataPagamento: 'desc' },
    })

    return NextResponse.json({ payments })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/[id]/pagamenti', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei pagamenti' },
      { status: 500 }
    )
  }
}

// POST /api/scadenzario/[id]/pagamenti - Registra pagamento
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica esistenza scadenza
    const schedule = await prisma.schedule.findFirst({
      where: { id: id },
      select: {
        id: true,
        venueId: true,
        importoTotale: true,
        importoPagato: true,
        stato: true,
        dataPagamento: true,
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = createPaymentSchema.parse(body)

    const dataPagamento = new Date(validatedData.dataPagamento)

    // Crea pagamento
    const payment = await prisma.schedulePayment.create({
      data: {
        scheduleId: id,
        importo: validatedData.importo,
        dataPagamento,
        metodo: validatedData.metodo,
        riferimento: validatedData.riferimento,
        note: validatedData.note,
      },
    })

    // Calcola nuovo totale pagato
    const aggregatedPayments = await prisma.schedulePayment.aggregate({
      where: { scheduleId: id },
      _sum: { importo: true },
    })

    const nuovoImportoPagato = Number(aggregatedPayments._sum.importo || 0)
    const importoTotale = Number(schedule.importoTotale)

    // Determina nuovo stato
    let nuovoStato = schedule.stato
    if (nuovoImportoPagato >= importoTotale) {
      nuovoStato = ScheduleStatus.PAGATA
    } else if (nuovoImportoPagato > 0) {
      nuovoStato = ScheduleStatus.PARZIALMENTE_PAGATA
    }

    // Aggiorna schedule
    const updatedSchedule = await prisma.schedule.update({
      where: { id: id },
      data: {
        importoPagato: nuovoImportoPagato,
        stato: nuovoStato,
        ...(nuovoStato === ScheduleStatus.PAGATA && !schedule.dataPagamento && {
          dataPagamento: dataPagamento,
        }),
      },
    })

    return NextResponse.json({
      payment,
      schedule: {
        ...updatedSchedule,
        importoResiduo: importoTotale - nuovoImportoPagato,
      },
    })
  } catch (error) {
    logger.error('Errore POST /api/scadenzario/[id]/pagamenti', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella registrazione del pagamento' },
      { status: 500 }
    )
  }
}
