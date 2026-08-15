import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { toDebitCredit } from '@/lib/prima-nota-utils'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import {
  riconciliaInTransazione,
  dopoLaRiconciliazione,
} from '@/lib/services/schedule-reconciliation-service'

/**
 * Paga una scadenza in contanti.
 *
 * Per la cassa non esiste un flusso da importare: il movimento lo deve creare
 * qualcuno. Questa rotta lo crea — vero, alla data in cui il denaro è uscito —
 * e lo riconcilia con la scadenza nello stesso atto, passando dal motore che
 * usa anche la banca.
 *
 * Non è una seconda porta d'ingresso in prima nota: è la stessa porta con una
 * maniglia più comoda. La differenza non è formale — una porta parallela era
 * esattamente il difetto che questa spec toglie.
 *
 * Spec: docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md
 */
const corpoSchema = z.object({
  dataPagamento: z.coerce.date({ message: 'Data di pagamento obbligatoria' }),
  /** Quota da pagare: se assente si salda il residuo della scadenza. */
  importo: z.number().positive('L\'importo deve essere positivo').optional(),
})

/**
 * Porta fuori dalla transazione l'esito negativo della riconciliazione,
 * facendola cadere per intero: senza eccezione il movimento resterebbe scritto
 * e la cassa si muoverebbe senza che nulla risulti saldato — cioè il difetto
 * che questa spec elimina, in miniatura.
 */
class ErroreRiconciliazione extends Error {
  readonly stato: number
  readonly messaggio: string

  constructor(esito: { outcome: string; motivo?: string }) {
    super(esito.outcome)
    this.name = 'ErroreRiconciliazione'
    this.messaggio = esito.motivo ?? 'Il movimento non è stato riconciliato con la scadenza'
    this.stato = esito.outcome === 'amount_exceeds_capacity' ? 422 : 409
  }
}

export async function POST(
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
    const { dataPagamento, importo } = corpoSchema.parse(await request.json())

    const schedule = await prisma.schedule.findFirst({
      where: { id, venueId },
      select: {
        id: true,
        tipo: true,
        stato: true,
        importoTotale: true,
        importoPagato: true,
        descrizione: true,
        invoice: { select: { accountId: true, invoiceNumber: true } },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    if (schedule.stato === 'pagata' || schedule.stato === 'annullata') {
      return NextResponse.json(
        { error: `La scadenza è ${schedule.stato}: non può essere pagata` },
        { status: 409 }
      )
    }

    const residuo = Number(schedule.importoTotale) - Number(schedule.importoPagato)
    const quota = importo ?? residuo

    if (quota <= 0) {
      return NextResponse.json(
        { error: 'La scadenza non ha residuo da pagare' },
        { status: 400 }
      )
    }

    // Il centro si valuta sul conto ECONOMICO della fattura, non sulla cassa:
    // è il costo a dover essere imputato a un centro, non il registro da cui
    // esce il denaro.
    const centro = await risolviCentroDiCosto(
      prisma,
      { accountId: schedule.invoice?.accountId ?? null },
      'interattivo'
    )
    if (centro.outcome === 'invalid') {
      return NextResponse.json({ error: centro.motivo, code: centro.code }, { status: 400 })
    }

    // Una scadenza passiva è denaro che esce, una attiva denaro che entra. Il
    // verso non si scrive a mano: lo decide l'unico posto in cui vive la
    // convenzione dare/avere del progetto.
    const { debitAmount, creditAmount } = toDebitCredit(
      'CASH',
      schedule.tipo === 'passiva' ? 'USCITA' : 'INCASSO',
      new Prisma.Decimal(quota.toFixed(2))
    )

    const ingresso = {
      scheduleId: id,
      venueId,
      userId: session.user.id,
      amount: quota,
      source: 'MANUAL' as const,
    }

    const esito = await prisma.$transaction(async (tx) => {
      const movimento = await tx.journalEntry.create({
        data: {
          venueId,
          date: dataPagamento,
          registerType: 'CASH',
          entryType: schedule.tipo === 'passiva' ? 'USCITA' : 'INCASSO',
          description: `Pagamento in contanti: ${schedule.descrizione}`,
          documentRef: schedule.invoice?.invoiceNumber ?? null,
          debitAmount,
          creditAmount,
          // Testata di ripiego: con le fette il conto economico la ignora, ma
          // senza fette è l'unica fonte e il costo sparirebbe dai report.
          accountId: schedule.invoice?.accountId ?? null,
          costCenterId: centro.costCenterId,
          costCenterSource: centro.origine,
          // Nessuna supposizione: un umano dichiara di aver pagato.
          verified: true,
          createdById: session.user.id,
        },
      })

      const riconciliazione = await riconciliaInTransazione(tx, {
        ...ingresso,
        journalEntryId: movimento.id,
      })

      if (riconciliazione.outcome !== 'ok') {
        throw new ErroreRiconciliazione(riconciliazione)
      }

      return { movimento, riconciliazione }
    })

    // Stime del fornitore e log: fuori dalla transazione, come per la rotta
    // sorella delle riconciliazioni.
    const pubblico = await dopoLaRiconciliazione(esito.riconciliazione, {
      ...ingresso,
      journalEntryId: esito.movimento.id,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'ScheduleReconciliation',
      entityId: esito.riconciliazione.reconciliationId,
      venueId,
      newValues: {
        scheduleId: id,
        journalEntryId: esito.movimento.id,
        registro: 'CASH',
        quota,
        dataPagamento: dataPagamento.toISOString(),
      },
    })

    return NextResponse.json({
      journalEntryId: esito.movimento.id,
      reconciliationId: esito.riconciliazione.reconciliationId,
      quota,
      stato: pubblico.outcome === 'ok' ? pubblico.scheduleStato : undefined,
      message: 'Pagamento in contanti registrato',
    })
  } catch (error) {
    if (error instanceof ErroreRiconciliazione) {
      return NextResponse.json({ error: error.messaggio }, { status: error.stato })
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }

    logger.error('Errore POST /api/scadenzario/[id]/paga-in-contanti', error)
    return NextResponse.json(
      { error: 'Errore nella registrazione del pagamento' },
      { status: 500 }
    )
  }
}
