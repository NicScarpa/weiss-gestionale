import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { bloccaMovimento, importoUtileMovimento } from '@/lib/scadenzario/stato-schedule'
import { aggiornaContoDominante, type TransactionClient } from '@/lib/services/allocation-service'
import { ereditaFetteDaFattura, ritiraIvaDiTestata } from '@/lib/services/schedule-reconciliation-service'

/**
 * Divergenza fra le fette e la fattura, e il suo riallineamento (Task 7,
 * spec sezione 2 «Le fette sono una fotografia, e la fotografia parla»).
 *
 * Il problema: l'imputazione di una riga fattura può cambiare DOPO che la
 * riconciliazione ha generato le fette ereditate. Non c'è propagazione
 * automatica — un mese già chiuso non si riscrive da solo — ma la
 * divergenza è rilevabile con i dati che ci sono già: `InvoiceLineAccount`
 * porta `updatedAt`, la fetta porta `createdAt`. Se la prima è più recente
 * della seconda, la fetta racconta un'imputazione superata.
 *
 * Il riallineamento non inventa una logica nuova: cancella le fette
 * `ereditata` della riconciliazione e richiama `ereditaFetteDaFattura`, la
 * STESSA funzione della riconciliazione originaria — che rilegge
 * `invoice_line_accounts` da capo e quindi vede le imputazioni correnti.
 */

/** Una riconciliazione le cui fette non raccontano più la fattura di oggi. */
interface Divergenza {
  reconciliationId: string
  invoiceId: string
  /** L'`updatedAt` più recente fra le imputazioni della fattura che hanno superato le fette. */
  modificataIl: Date
}

/**
 * Le riconciliazioni verificate del movimento le cui fette ereditate sono
 * più vecchie dell'ultima imputazione della loro fattura.
 *
 * Guarda solo le riconciliazioni legate a una fattura — le scadenze senza
 * fattura (scontrini, spese) non hanno righe da reimputare — e solo quelle
 * che hanno effettivamente scritto fette ereditate: senza fette non c'è un
 * `createdAt` con cui confrontare `updatedAt`, quindi nessuna divergenza è
 * rilevabile. È lo stesso caso delle guardie di `ereditaFetteDaFattura` che
 * si astengono senza scrivere nulla — fattura non coperta per intero, righe
 * ancora in proposta, fette manuali che vincono sempre.
 *
 * Non filtra per `numeroLinea` né per `progressivo` (Task 5): un `updatedAt`
 * su QUALSIASI imputazione della fattura, comprese le quote di una riga
 * divisa fra più conti, vale come divergenza — tutte concorrono al calcolo
 * dei pesi che ha generato quelle fette.
 *
 * Riceve il client di transazione perché il riallineamento la richiama SOTTO
 * lo stesso lock che protegge la scrittura (vedi `riallineaFette`): due
 * viste diverse dello stesso controllo, non due controlli.
 */
async function divergenzeDelMovimento(
  client: TransactionClient,
  journalEntryId: string
): Promise<Divergenza[]> {
  const riconciliazioni = await client.scheduleReconciliation.findMany({
    where: { journalEntryId, status: 'VERIFIED', schedule: { invoiceId: { not: null } } },
    select: {
      id: true,
      schedule: { select: { invoiceId: true } },
      allocations: { select: { createdAt: true } },
    },
  })

  const divergenze: Divergenza[] = []
  for (const riconciliazione of riconciliazioni) {
    const invoiceId = riconciliazione.schedule.invoiceId
    if (!invoiceId || riconciliazione.allocations.length === 0) continue

    // Tutte le fette di una riconciliazione nascono dalla stessa `createMany`,
    // quindi condividono praticamente lo stesso istante: il minimo è una
    // difesa contro scritture non atomiche, non un caso atteso.
    const creataIl = riconciliazione.allocations.reduce(
      (min, f) => (f.createdAt < min ? f.createdAt : min),
      riconciliazione.allocations[0].createdAt
    )

    const imputazioneSuperata = await client.invoiceLineAccount.findFirst({
      where: { invoiceId, updatedAt: { gt: creataIl } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    })

    if (imputazioneSuperata) {
      divergenze.push({ reconciliationId: riconciliazione.id, invoiceId, modificataIl: imputazioneSuperata.updatedAt })
    }
  }

  return divergenze
}

/**
 * C'è una fattura, collegata a questo movimento, la cui imputazione è
 * cambiata dopo che le fette sono nate?
 *
 * Fuori transazione: è una lettura per decidere se mostrare l'avviso e il
 * pulsante *Riallinea*, non partecipa a nessuna scrittura. Se più
 * riconciliazioni del movimento sono divergenti (bonifico cumulativo su più
 * fatture) si riporta la più recente, che è quella per cui l'avviso ha più
 * senso mostrare per prima.
 */
export async function imputazioniDivergenti(
  journalEntryId: string
): Promise<{ divergente: boolean; invoiceId: string | null; modificataIl: Date | null }> {
  const divergenze = await divergenzeDelMovimento(prisma, journalEntryId)
  if (divergenze.length === 0) {
    return { divergente: false, invoiceId: null, modificataIl: null }
  }

  const piuRecente = divergenze.reduce((max, d) => (d.modificataIl > max.modificataIl ? d : max))
  return { divergente: true, invoiceId: piuRecente.invoiceId, modificataIl: piuRecente.modificataIl }
}

/**
 * Cancella le fette `ereditata` divergenti del movimento e le rigenera dalle
 * imputazioni correnti della fattura. Le fette `manuale` non si toccano,
 * coerentemente con la regola che vincono sempre — e se ce ne sono,
 * `ereditaFetteDaFattura` si astiene dallo scriverne di nuove, esattamente
 * come farebbe una riconciliazione nuova sullo stesso movimento.
 *
 * **Non duplica il calcolo dei pesi.** Rigenera chiamando
 * `ereditaFetteDaFattura` — la stessa funzione della riconciliazione
 * originaria (Task 2) — con lo stesso `reconciliationId` e la stessa
 * `quota` di allora: quel che cambia è solo la lettura di
 * `invoice_line_accounts`, che nel frattempo è cambiata. La quota non si
 * ricalcola: il riallineamento corregge la RIPARTIZIONE fra conti, non
 * quanto di quella fattura questo movimento ha pagato.
 *
 * **`vatAmount`.** Prima di rigenerare, l'IVA delle vecchie fette viene
 * ritirata dalla testata con `ritiraIvaDiTestata` — la stessa funzione
 * dell'annullo, con la stessa regola di proprietà: il campo si tocca solo
 * se è ancora nostro (assente, o uguale a quanto le fette cancellate
 * dichiaravano). `ereditaFetteDaFattura` poi lo riscrive da capo con la
 * stessa regola. Il risultato netto è quello atteso: se l'IVA di testata
 * era nostra, segue le fette nuove; se un essere umano l'aveva dichiarata
 * lui, il riallineamento la lascia esattamente com'era, come qualunque
 * altra scrittura di questo modulo.
 *
 * **Concorrenza**: prende lo stesso lock di riga della riconciliazione e
 * dell'annullo (`bloccaMovimento`), quindi non può correre in parallelo con
 * loro sullo stesso movimento.
 *
 * Ritorna il numero di fette scritte in totale (0 se il movimento non
 * esiste o non c'è nulla da riallineare): la route lo usa solo per
 * riportarlo in risposta, la decisione se rispondere 409 spetta a
 * `imputazioniDivergenti`, chiamata prima di aprire la transazione.
 */
export async function riallineaFette(
  tx: TransactionClient,
  journalEntryId: string,
  userId: string | null
): Promise<number> {
  const entry = await bloccaMovimento(tx, journalEntryId)
  if (!entry) return 0

  const divergenze = await divergenzeDelMovimento(tx, journalEntryId)
  if (divergenze.length === 0) return 0

  let fetteScritte = 0

  for (const { reconciliationId, invoiceId } of divergenze) {
    const riconciliazione = await tx.scheduleReconciliation.findUnique({
      where: { id: reconciliationId },
      select: { amount: true, schedule: { select: { tipo: true } } },
    })
    // Sparita fra la rilevazione (poco sopra, sotto lo stesso lock) e qui:
    // non dovrebbe poter succedere nella stessa transazione, ma non c'è
    // nulla da riallineare per una riconciliazione che non c'è più.
    if (!riconciliazione) continue

    // Le fette COME STANNO PRIMA della cancellazione, di TUTTO il movimento:
    // serve a `ritiraIvaDiTestata` per sapere se l'IVA di testata è ancora
    // nostra, esattamente come all'annullo.
    const fettePrima = await tx.journalEntryAllocation.findMany({
      where: { journalEntryId },
      select: { iva: true, reconciliationId: true },
    })

    const fetteRitirate = await tx.journalEntryAllocation.deleteMany({ where: { reconciliationId } })

    if (fetteRitirate.count > 0) {
      await ritiraIvaDiTestata(tx, { journalEntryId, reconciliationId, fettePrima })
    }

    const scritte = await ereditaFetteDaFattura(tx, {
      journalEntryId,
      invoiceId,
      reconciliationId,
      quota: Number(riconciliazione.amount),
      importoUtileMovimento: importoUtileMovimento(entry, riconciliazione.schedule.tipo),
    })
    fetteScritte += scritte

    logger.info('Fette riallineate alle imputazioni correnti della fattura', {
      journalEntryId,
      reconciliationId,
      invoiceId,
      fetteRimosse: fetteRitirate.count,
      fetteScritte: scritte,
    })

    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'ScheduleReconciliation',
      entityId: reconciliationId,
      oldValues: { fette: fetteRitirate.count },
      newValues: { fette: scritte, invoiceId, riallineamento: true },
    })
  }

  // Come per l'annullo: il dominante si ricalcola su TUTTE le fette rimaste
  // sul movimento, e se non ne resta nessuna la categorizzazione torna
  // semplice. Serve anche quando `ereditaFetteDaFattura` ha già richiamato
  // `aggiornaContoDominante` da sé (fette scritte): rifarlo qui una volta di
  // più, sullo stato finale dopo l'intero ciclo, non costa nulla ed è l'unico
  // modo di coprire anche il caso in cui l'ultima riconciliazione riallineata
  // non abbia scritto nulla (una guardia si è astenuta) e quella chiamata
  // interna non sia mai avvenuta.
  const numeroFette = await aggiornaContoDominante(tx, journalEntryId, 'automatico')
  if (numeroFette === 0) {
    await tx.journalEntry.update({
      where: { id: journalEntryId },
      data: { categorizationSource: 'manual' },
    })
  }

  return fetteScritte
}
