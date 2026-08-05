import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  tipoDocumentoDaCodiceSdi,
  tipoPagamentoDaCodiceSdi,
} from '@/lib/schedule-rules/engine'
import { ScheduleRuleDirection } from '@/types/schedule'
import { logger } from '@/lib/logger'

/**
 * Ponte fra le fatture elettroniche e lo scadenzario.
 *
 * Prima di questo modulo le rate di pagamento estratte dall'XML finivano in
 * InvoiceDeadline e non venivano lette da nessuna schermata: le fatture
 * importate erano invisibili nel calendario, nel saldo scalare e nell'aging.
 *
 * Chi è la fonte di verità: la Schedule generata. InvoiceDeadline resta il
 * dato grezzo estratto dal documento (non viene mai aggiornato), mentre stato
 * e pagamenti parziali vivono sulla Schedule e sulle sue SchedulePayment.
 *
 * Deduplica: `Schedule.invoiceDeadlineId` è unique, quindi una rata genera al
 * massimo una scadenza anche se la generazione venisse rieseguita. A monte
 * l'import rifiuta comunque le fatture già presenti (stesso numero, data e
 * partita IVA).
 */

/** Le fatture di vendita generano scadenze da incassare, gli acquisti da pagare. */
function direzioneDaTipoDocumento(documentType: string | null): ScheduleRuleDirection {
  // TD01 e simili in ricezione sono acquisti; il gestionale importa oggi solo
  // fatture passive, ma il tipo documento resta la fonte della distinzione.
  return documentType === 'TD24' || documentType === 'TD25'
    ? ScheduleRuleDirection.EMESSI
    : ScheduleRuleDirection.RICEVUTI
}

interface DeadlineInput {
  id: string
  dueDate: Date
  amount: Prisma.Decimal | number
  paymentMethod: string | null
}

interface InvoiceInput {
  id: string
  venueId: string
  invoiceNumber: string
  invoiceDate: Date
  documentType: string | null
  supplierId: string | null
  supplierName: string | null
  deadlines: DeadlineInput[]
}

export interface GenerateSchedulesResult {
  created: number
  skipped: number
}

/**
 * Crea nello scadenzario una scadenza per ogni rata della fattura.
 * Le rate che hanno già una scadenza vengono saltate.
 */
export async function generateSchedulesFromInvoice(
  invoice: InvoiceInput,
  userId: string | null,
  client: Pick<typeof prisma, 'schedule'> = prisma
): Promise<GenerateSchedulesResult> {
  if (invoice.deadlines.length === 0) {
    return { created: 0, skipped: 0 }
  }

  const direzione = direzioneDaTipoDocumento(invoice.documentType)
  const tipo = direzione === ScheduleRuleDirection.EMESSI ? 'attiva' : 'passiva'
  const tipoDocumento = tipoDocumentoDaCodiceSdi(invoice.documentType, direzione)

  const alreadyLinked = await client.schedule.findMany({
    where: { invoiceDeadlineId: { in: invoice.deadlines.map((d) => d.id) } },
    select: { invoiceDeadlineId: true },
  })
  const linkedIds = new Set(alreadyLinked.map((s) => s.invoiceDeadlineId))

  const daCreare = invoice.deadlines.filter((d) => !linkedIds.has(d.id))
  if (daCreare.length === 0) {
    return { created: 0, skipped: invoice.deadlines.length }
  }

  const rateTotali = invoice.deadlines.length
  const controparte = invoice.supplierName ?? 'Fornitore non identificato'

  for (const [index, deadline] of daCreare.entries()) {
    const numeroRata = invoice.deadlines.findIndex((d) => d.id === deadline.id) + 1
    const descrizione =
      rateTotali > 1
        ? `${controparte} — fattura ${invoice.invoiceNumber} (rata ${numeroRata}/${rateTotali})`
        : `${controparte} — fattura ${invoice.invoiceNumber}`

    await client.schedule.create({
      data: {
        venueId: invoice.venueId,
        tipo,
        stato: 'aperta',
        descrizione,
        importoTotale: new Prisma.Decimal(deadline.amount.toString()),
        dataScadenza: deadline.dueDate,
        dataEmissione: invoice.invoiceDate,
        tipoDocumento: tipoDocumento ?? undefined,
        numeroDocumento: invoice.invoiceNumber,
        supplierId: invoice.supplierId,
        controparteNome: invoice.supplierName,
        metodoPagamento: tipoPagamentoDaCodiceSdi(deadline.paymentMethod) ?? undefined,
        source: 'import_fatture_sdi',
        invoiceId: invoice.id,
        invoiceDeadlineId: deadline.id,
        createdById: userId,
      },
    })

    // index è usato solo per il log: le scadenze sono create in sequenza
    logger.info('Scadenza generata da fattura', {
      invoiceId: invoice.id,
      deadlineId: deadline.id,
      posizione: index + 1,
    })
  }

  return { created: daCreare.length, skipped: rateTotali - daCreare.length }
}

export interface InvoiceDeletionCheck {
  canDelete: boolean
  /** Scadenze generate dalla fattura su cui risultano pagamenti registrati */
  schedulesWithPayments: Array<{ id: string; descrizione: string; importoPagato: string }>
  totalSchedules: number
}

/**
 * Verifica se una fattura può essere eliminata.
 *
 * Blocca quando sulle scadenze generate risultano pagamenti registrati:
 * cancellare la fattura significherebbe perdere il collegamento fra un
 * pagamento realmente uscito dal conto e il documento che lo giustifica.
 */
export async function checkInvoiceDeletable(
  invoiceId: string
): Promise<InvoiceDeletionCheck> {
  const schedules = await prisma.schedule.findMany({
    where: { invoiceId },
    select: {
      id: true,
      descrizione: true,
      importoPagato: true,
      _count: { select: { payments: true } },
    },
  })

  const withPayments = schedules.filter(
    (s) => s._count.payments > 0 || Number(s.importoPagato) > 0
  )

  return {
    canDelete: withPayments.length === 0,
    schedulesWithPayments: withPayments.map((s) => ({
      id: s.id,
      descrizione: s.descrizione,
      importoPagato: s.importoPagato.toString(),
    })),
    totalSchedules: schedules.length,
  }
}

/**
 * Cancella logicamente le scadenze generate da una fattura eliminata.
 * Va invocata solo dopo checkInvoiceDeletable: qui non ci sono pagamenti da
 * proteggere.
 */
export async function softDeleteSchedulesForInvoice(
  invoiceId: string,
  userId: string | null,
  client: Pick<typeof prisma, 'schedule'> = prisma
): Promise<number> {
  const result = await client.schedule.updateMany({
    where: { invoiceId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: userId },
  })

  return result.count
}
