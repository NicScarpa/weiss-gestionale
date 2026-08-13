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

/**
 * Tipi documento che rettificano una fattura precedente invece di generare un
 * nuovo debito: non producono una scadenza autonoma. Una nota di credito
 * riduce quanto dovuto al fornitore, non è qualcosa da pagare a una data.
 *
 * Esportata perché la route di import la riusa per decidere quando risolvere
 * `rettificaInvoiceId` (Task 6): stessa domanda — "questo documento rettifica
 * una fattura precedente?" — quindi stessa lista, non una copia che potrebbe
 * divergere.
 */
export const TIPI_DOCUMENTO_SENZA_SCADENZA = new Set(['TD04', 'TD05', 'TD08', 'TD09'])

/**
 * Sottoinsieme di `TIPI_DOCUMENTO_SENZA_SCADENZA` che RIDUCE il dovuto: le
 * note di credito (TD04, e la sua variante semplificata TD08). TD05/TD09 sono
 * note di DEBITO — aumentano il dovuto, l'opposto — e non generano comunque
 * una scadenza propria, ma per la stessa ragione opposta: si sommano al
 * pagamento successivo invece di sottrarsene.
 *
 * Esportata perché `schedule-reconciliation-service.ts` la usa per filtrare
 * quali documenti collegati entrano nella sottrazione dei pesi (Task 6): una
 * nota di debito linkata da `rettificaInvoiceId` non deve mai finire fra le
 * righe da sottrarre, o il segno del suo importo si inverte due volte.
 */
export const TIPI_DOCUMENTO_NOTA_CREDITO = new Set(['TD04', 'TD08'])

/**
 * L'import legge sempre il cedente/prestatore come fornitore
 * (`src/app/api/invoices/route.ts`), quindi tratta esclusivamente fatture
 * ricevute: le scadenze generate sono sempre passive, da pagare.
 *
 * Attenzione: il tipo documento NON distingue attive da passive. TD24 e TD25
 * sono fatture differite ex art. 21 c. 4 — il documento tipico del fornitore
 * che consegna con DDT e fattura a fine mese, quindi ricevute a tutti gli
 * effetti. Quando il gestionale emetterà fatture attive servirà un
 * discriminante esplicito sul documento, non una lista di codici TD.
 */
const TIPO_SCADENZA_DA_IMPORT = 'passiva' as const

interface DeadlineInput {
  id: string
  dueDate: Date
  amount: Prisma.Decimal | number
  paymentMethod: string | null
  /**
   * Valorizzata quando la data di scadenza è stata stimata perché l'XML non
   * la riportava: va resa visibile sulla scadenza, altrimenti sembrerebbe un
   * termine dichiarato dal fornitore.
   */
  notaStima?: string
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

  // Note di credito e debito rettificano una fattura esistente: non generano
  // una scadenza da pagare, altrimenti aumenterebbero il debito invece di ridurlo
  if (invoice.documentType && TIPI_DOCUMENTO_SENZA_SCADENZA.has(invoice.documentType)) {
    logger.info('Nessuna scadenza generata: documento di rettifica', {
      invoiceId: invoice.id,
      documentType: invoice.documentType,
    })
    return { created: 0, skipped: invoice.deadlines.length }
  }

  const tipo = TIPO_SCADENZA_DA_IMPORT
  const tipoDocumento = tipoDocumentoDaCodiceSdi(
    invoice.documentType,
    ScheduleRuleDirection.RICEVUTI
  )

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
        note: deadline.notaStima,
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
