import { logger } from '@/lib/logger'
import { bloccaMovimento, importoUtileMovimento } from '@/lib/scadenzario/stato-schedule'
import { type TransactionClient } from '@/lib/services/allocation-service'
import { TIPI_DOCUMENTO_NOTA_CREDITO } from '@/lib/services/invoice-schedule-service'
import { ereditaFetteDaFattura, ritiraIvaDiTestata } from '@/lib/services/schedule-reconciliation-service'
import { prisma } from '@/lib/prisma'

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
  /** L'`updatedAt` più recente fra le imputazioni che hanno superato le fette. */
  modificataIl: Date
}

/**
 * Le riconciliazioni verificate del movimento le cui fette ereditate sono
 * più vecchie dell'ultima imputazione della loro fattura — o di una nota di
 * credito che la rettifica.
 *
 * Guarda solo le riconciliazioni legate a una fattura — le scadenze senza
 * fattura (scontrini, spese) non hanno righe da reimputare — e solo quelle
 * che hanno effettivamente scritto fette ereditate: senza fette non c'è un
 * `createdAt` con cui confrontare `updatedAt`, quindi nessuna divergenza è
 * rilevabile. È lo stesso caso delle guardie di `ereditaFetteDaFattura` che
 * si astengono senza scrivere nulla — fattura non coperta per intero, righe
 * ancora in proposta, fette manuali che vincono sempre.
 *
 * **Include le note di credito che rettificano la fattura** (spec sezione 4:
 * «nota di credito arrivata dopo il pagamento... è il caso della sezione 2 —
 * divergenza rilevata»). Confermare le righe di una nota non tocca
 * `invoice_line_accounts` della fattura originaria, quindi senza questo `OR`
 * quel caso non produrrebbe mai un avviso: `ereditaFetteDaFattura` la
 * calcolerebbe comunque bene se richiamata a mano, ma nessuno vedrebbe il
 * pulsante *Riallinea* comparire. **Stesso filtro sui tipi documento di
 * `righeDaSottrarreNote`**: `rettificaInvoiceId` si valorizza anche per le
 * note di DEBITO, che rettificano la fattura ma nel verso opposto — un
 * avviso il cui riallineamento non cambierebbe nulla sarebbe la beffa dopo
 * il bug del segno invertito (Task 6).
 *
 * Non filtra per `numeroLinea` né per `progressivo` (Task 5): un `updatedAt`
 * su QUALSIASI imputazione, comprese le quote di una riga divisa fra più
 * conti, vale come divergenza — tutte concorrono al calcolo dei pesi che ha
 * generato quelle fette.
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
      where: {
        updatedAt: { gt: creataIl },
        invoice: {
          OR: [
            { id: invoiceId },
            { rettificaInvoiceId: invoiceId, documentType: { in: [...TIPI_DOCUMENTO_NOTA_CREDITO] } },
          ],
        },
      },
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
 * C'è una fattura, collegata a questo movimento, la cui imputazione (o
 * quella di una nota di credito che la rettifica) è cambiata dopo che le
 * fette sono nate?
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
 * Il riallineamento di una riconciliazione non può procedere: le sue fette
 * `ereditata` sono già state cancellate, ma `ereditaFetteDaFattura` si è
 * astenuta dal riscriverle (una delle sue guardie è scattata — fattura non
 * più coperta per intero, fette manuali presenti sul movimento, capienza
 * superata, nota di credito non imputata per intero o più grande della riga
 * che rettifica, o la fattura stessa non più leggibile).
 *
 * Lasciare la riconciliazione senza fette sarebbe peggio di non aver
 * riallineato affatto: il prospetto sposterebbe l'intero importo sul conto
 * di testata, e lo stato sarebbe irrecuperabile dalla stessa rotta, perché
 * senza fette la rilevazione (`divergenzeDelMovimento`) non trova più nulla
 * da confrontare e smette di segnalare la riconciliazione come divergente.
 * Per questo l'intera operazione va indietro, non solo questo passaggio: chi
 * chiama (`riallineaFette`, dentro una `$transaction`) lascia che l'eccezione
 * risalga, così la transazione fa rollback e nessuna fetta va persa.
 */
export class RiallineamentoNonRigenerabile extends Error {
  constructor(
    readonly reconciliationId: string,
    readonly invoiceId: string
  ) {
    super(
      'Le fette non sono state rigenerate: verifica che tutte le righe della fattura siano ' +
        'confermate, che non ci siano fette manuali sul movimento, che la capienza non sia ' +
        'superata e che le note di credito collegate siano imputate per intero.'
    )
    this.name = 'RiallineamentoNonRigenerabile'
  }
}

/** Esito del riallineamento di una singola riconciliazione divergente. */
export interface RiconciliazioneRiallineata {
  reconciliationId: string
  invoiceId: string
  /** Fette `ereditata` cancellate (sempre ≥ 1: la rilevazione lo garantisce). */
  fetteRimosse: number
  /** Fette nuove scritte al loro posto (sempre ≥ 1, o l'operazione è andata indietro). */
  fetteScritte: number
}

/**
 * Cancella le fette `ereditata` divergenti del movimento e le rigenera dalle
 * imputazioni correnti della fattura. Le fette `manuale` non si toccano,
 * coerentemente con la regola che vincono sempre.
 *
 * **Tutto o niente.** Ogni riconciliazione divergente passa per lo stesso
 * ciclo cancella-e-riscrivi di `ereditaFetteDaFattura`: se quella funzione si
 * astiene (`scritte === 0`) dopo che le fette vecchie sono già state
 * cancellate, l'operazione lancia `RiallineamentoNonRigenerabile` invece di
 * proseguire. Questo vale anche per la guardia "le manuali vincono": se sul
 * movimento sono comparse fette manuali che bloccano la rigenerazione, non è
 * un no-op silenzioso come lo sarebbe per una riconciliazione nuova (che
 * semplicemente non ha ancora fette da perdere) — qui ci sono già fette vere,
 * e cancellarle senza rimpiazzarle sposterebbe soldi già categorizzati sul
 * conto di testata. Chi chiama (la rotta) apre la transazione con
 * `prisma.$transaction`: l'eccezione la fa fare rollback, e nessuna fetta
 * risulta mai persa.
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
 * stessa regola.
 *
 * **Il conto dominante non va ricalcolato a parte.** Con il tutto-o-niente
 * qui sopra, ogni riconciliazione che completa il ciclo senza lanciare ha
 * `fetteScritte > 0`, e `ereditaFetteDaFattura` chiama già
 * `aggiornaContoDominante` da sé quando scrive fette. Alla fine del ciclo lo
 * stato è quindi sempre già coerente: un'altra chiamata qui sarebbe
 * ridondante — non sbagliata, solo morta, perché non esiste un caso in cui
 * il ciclo finisca senza lanciare e con zero fette sul movimento.
 *
 * **L'audit non lo scrive questa funzione**: userebbe il client globale
 * `prisma`, non `tx`, quindi la riga si committerebbe subito e sopravviverebbe
 * a un rollback — dichiarando un riallineamento mai avvenuto. Chi chiama
 * scrive l'audit dopo che `$transaction` è risolta, con `RiconciliazioneRiallineata[]`
 * che questa funzione ritorna.
 *
 * **Concorrenza**: prende lo stesso lock di riga della riconciliazione e
 * dell'annullo (`bloccaMovimento`), quindi non può correre in parallelo con
 * loro sullo stesso movimento.
 *
 * Ritorna un elemento per riconciliazione riallineata (array vuoto se il
 * movimento non esiste o non c'è nulla da riallineare) — mai un risultato
 * parziale: o l'intero array, o l'eccezione e nessuna scrittura sopravvive.
 */
export async function riallineaFette(
  tx: TransactionClient,
  journalEntryId: string
): Promise<RiconciliazioneRiallineata[]> {
  const entry = await bloccaMovimento(tx, journalEntryId)
  if (!entry) return []

  const divergenze = await divergenzeDelMovimento(tx, journalEntryId)
  if (divergenze.length === 0) return []

  const eseguiti: RiconciliazioneRiallineata[] = []

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

    if (scritte === 0) {
      throw new RiallineamentoNonRigenerabile(reconciliationId, invoiceId)
    }

    logger.info('Fette riallineate alle imputazioni correnti della fattura', {
      journalEntryId,
      reconciliationId,
      invoiceId,
      fetteRimosse: fetteRitirate.count,
      fetteScritte: scritte,
    })

    eseguiti.push({ reconciliationId, invoiceId, fetteRimosse: fetteRitirate.count, fetteScritte: scritte })
  }

  return eseguiti
}
