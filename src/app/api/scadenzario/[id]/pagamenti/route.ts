import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { formatCurrency } from '@/lib/formatters'
import { ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import {
  bloccaScadenza,
  ricalcolaStatoSchedule,
  sommaPagamenti,
  TOLLERANZA_IMPORTI,
} from '@/lib/scadenzario/stato-schedule'

const createPaymentSchema = z.object({
  importo: z.number().positive('Importo deve essere positivo'),
  dataPagamento: z.coerce.date().or(z.string()),
  metodo: z.enum(['bonifico', 'riba', 'sdd', 'carta', 'contanti', 'f24', 'assegno', 'bollettino', 'credito_fiscale', 'senza_incasso', 'altro']).optional(),
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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createPaymentSchema.parse(body)

    const dataPagamento = new Date(validatedData.dataPagamento)

    // Creazione del pagamento e ricalcolo della scadenza in una transazione
    // sola, con la scadenza bloccata: prima erano cinque chiamate slegate che
    // leggevano il residuo prima di scrivere, e due richieste simultanee
    // potevano registrare insieme più del dovuto.
    const esito = await prisma.$transaction(async (tx) => {
      const schedule = await bloccaScadenza(tx, id)
      if (!schedule) return { errore: 'not_found' } as const

      if (schedule.stato === 'annullata') {
        return {
          errore: 'chiusa',
          messaggio: 'La scadenza è annullata: non accetta pagamenti',
        } as const
      }

      const { pagato } = await sommaPagamenti(tx, id)
      const residuo = Number(schedule.importoTotale) - pagato

      if (validatedData.importo > residuo + TOLLERANZA_IMPORTI) {
        return {
          errore: 'sfora',
          messaggio:
            `Il pagamento di ${formatCurrency(validatedData.importo)} supera il residuo ` +
            `della scadenza (${formatCurrency(Math.max(0, residuo))})`,
        } as const
      }

      const payment = await tx.schedulePayment.create({
        data: {
          scheduleId: id,
          importo: validatedData.importo,
          dataPagamento,
          metodo: validatedData.metodo,
          riferimento: validatedData.riferimento,
          note: validatedData.note,
        },
      })

      const stato = await ricalcolaStatoSchedule(tx, id)
      return { payment, stato: stato! } as const
    })

    if ('errore' in esito) {
      if (esito.errore === 'not_found') {
        return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
      }
      // 422 e non 400: la richiesta è ben formata, è l'importo a non stare in
      // piedi rispetto a quanto resta da pagare
      return NextResponse.json({ error: esito.messaggio }, { status: 422 })
    }

    // La storia del fornitore è cambiata: aggiorna le stime delle sue
    // scadenze aperte. Best-effort: non blocca la registrazione
    if (esito.stato.saldata && esito.stato.tipo === 'passiva' && esito.stato.supplierId) {
      await ricalcolaStimeFornitore(esito.stato.supplierId, esito.stato.venueId)
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'SchedulePayment',
      entityId: esito.payment.id,
      newValues: { scheduleId: id, importo: validatedData.importo },
    })

    return NextResponse.json({
      payment: esito.payment,
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
