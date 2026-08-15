/**
 * Macchina a stati delle scadenze: una sola implementazione.
 *
 * Prima esistevano quattro varianti divergenti della stessa transizione
 * (aperta → parzialmente_pagata → pagata, più la ricaduta sulla fattura): il
 * service di riconciliazione la calcolava in Decimal, il POST dei pagamenti in
 * float, il DELETE di un pagamento in un terzo modo, e il PATCH dello stato
 * cambiava lo stato senza toccare l'importo pagato — da cui scadenze "pagate"
 * con residuo positivo. Ogni percorso che tocca pagamenti o stato passa ora di
 * qui, dentro la transazione del chiamante.
 *
 * Tre scelte che rendono il ricalcolo sicuro:
 *
 *  - **Lock di riga.** La scadenza (e, dove serve, il movimento) viene bloccata
 *    con `SELECT ... FOR UPDATE`: due richieste simultanee si mettono in fila
 *    invece di leggere entrambe lo stesso stato e sovrascriversi a vicenda.
 *  - **Somma, mai incrementi.** `importoPagato` è ricalcolato come somma dei
 *    pagamenti registrati. Un incremento cieco (`pagato + quota`) propaga per
 *    sempre qualunque deriva pregressa; la somma la risana al primo passaggio.
 *  - **Stato derivato, non dichiarato.** Lo stato discende dagli importi.
 *    Quello dichiarato dall'utente entra come *base* (serve per 'annullata' e
 *    'scaduta', che gli importi non sanno esprimere) ma non può contraddire i
 *    pagamenti.
 */

import { Prisma } from '@prisma/client'
import type { TransactionClient } from '@/lib/services/allocation-service'

/**
 * Mezzo centesimo: sotto questa soglia due importi sono lo stesso importo.
 * Le colonne sono `Decimal(10,2)`, quindi la differenza fra due valori validi
 * è sempre ≥ 0.01; la tolleranza serve solo contro il rumore dei conti in
 * virgola mobile fatti a valle della lettura.
 */
export const TOLLERANZA_IMPORTI = 0.005

/** Stati che chiudono una scadenza: non concorrono al residuo di una fattura. */
const STATI_CHIUSI = ['pagata', 'annullata']

export interface OpzioniRicalcolo {
  /**
   * Stato richiesto dall'utente. Diventa la base della derivazione, non il
   * risultato: se i pagamenti dicono altro, vincono i pagamenti.
   */
  statoDichiarato?: string
}

export interface EsitoRicalcolo {
  scheduleId: string
  venueId: string
  tipo: string
  supplierId: string | null
  invoiceId: string | null
  stato: string
  statoPrecedente: string
  importoTotale: number
  importoPagato: number
  importoResiduo: number
  dataPagamento: Date | null
  /** La scadenza si è saldata adesso: la storia del fornitore è cambiata. */
  saldata: boolean
  /** La scadenza era saldata e non lo è più: la storia del fornitore è cambiata. */
  riaperta: boolean
}

interface ScadenzaBloccata {
  id: string
  venueId: string
  tipo: string
  stato: string
  importoTotale: Prisma.Decimal
  importoPagato: Prisma.Decimal
  invoiceId: string | null
  supplierId: string | null
  dataScadenza: Date
  dataAttesaSource: string | null
}

/**
 * Blocca la riga della scadenza fino alla fine della transazione e la
 * restituisce. `null` se non esiste, è cancellata logicamente o è di un'altra
 * sede.
 *
 * Il lock si prende con SQL grezzo perché Prisma non espone `FOR UPDATE`; la
 * lettura dei campi resta affidata al client, che applica il filtro sui
 * cancellati e la decifratura dei campi protetti.
 */
export async function bloccaScadenza(
  tx: TransactionClient,
  scheduleId: string,
  venueId?: string
): Promise<ScadenzaBloccata | null> {
  const bloccate = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM schedules
    WHERE id = ${scheduleId} AND deleted_at IS NULL
    FOR UPDATE
  `
  if (bloccate.length === 0) return null

  return tx.schedule.findFirst({
    where: { id: scheduleId, ...(venueId ? { venueId } : {}) },
    select: {
      id: true,
      venueId: true,
      tipo: true,
      stato: true,
      importoTotale: true,
      importoPagato: true,
      invoiceId: true,
      supplierId: true,
      dataScadenza: true,
      dataAttesaSource: true,
    },
  })
}

interface MovimentoBloccato {
  id: string
  date: Date
  description: string
  debitAmount: Prisma.Decimal | null
  creditAmount: Prisma.Decimal | null
  costCenterId: string | null
}

/**
 * Blocca la riga del movimento di prima nota. Va sempre preso PRIMA del lock
 * sulla scadenza: due percorsi che li acquisissero in ordine opposto si
 * bloccherebbero a vicenda.
 */
export async function bloccaMovimento(
  tx: TransactionClient,
  journalEntryId: string,
  venueId?: string
): Promise<MovimentoBloccato | null> {
  const bloccati = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM journal_entries
    WHERE id = ${journalEntryId} AND deleted_at IS NULL
    FOR UPDATE
  `
  if (bloccati.length === 0) return null

  return tx.journalEntry.findFirst({
    where: { id: journalEntryId, ...(venueId ? { venueId } : {}) },
    select: {
      id: true,
      date: true,
      description: true,
      debitAmount: true,
      creditAmount: true,
      // Serve a chi valida l'imputazione sotto lock (lo split): il centro del
      // movimento va letto nella stessa transazione che lo blocca, altrimenti
      // si valida una fotografia che un'altra richiesta può già aver cambiato.
      costCenterId: true,
    },
  })
}

/** Importo del movimento nel verso che salda una scadenza di questo tipo. */
export function importoUtileMovimento(
  entry: { debitAmount: Prisma.Decimal | null; creditAmount: Prisma.Decimal | null },
  tipo: string
): number {
  const entrata = entry.debitAmount ? Number(entry.debitAmount) : 0
  const uscita = entry.creditAmount ? Number(entry.creditAmount) : 0
  return tipo === 'attiva' ? entrata : uscita
}

/**
 * Quanto del movimento non è ancora impegnato su altre scadenze.
 *
 * Senza questo tetto un bonifico da 100 € può "saldare" 500 € di scadenze: il
 * controllo sul residuo della singola scadenza non vede le riconciliazioni già
 * registrate sullo stesso movimento. Da chiamare con il movimento già bloccato,
 * altrimenti due richieste simultanee leggono entrambe la stessa capienza.
 */
export async function capienzaResiduaMovimento(
  tx: TransactionClient,
  entry: { id: string; debitAmount: Prisma.Decimal | null; creditAmount: Prisma.Decimal | null },
  tipo: string
): Promise<{ utile: number; impegnato: number; disponibile: number }> {
  const utile = importoUtileMovimento(entry, tipo)

  const aggregato = await tx.scheduleReconciliation.aggregate({
    where: { journalEntryId: entry.id, status: 'VERIFIED' },
    _sum: { amount: true },
  })
  const impegnato = Number(aggregato._sum.amount ?? 0)

  return { utile, impegnato, disponibile: utile - impegnato }
}

/** Somma dei pagamenti registrati sulla scadenza, e data dell'ultimo. */
export async function sommaPagamenti(
  tx: TransactionClient,
  scheduleId: string
): Promise<{ pagato: number; ultimaData: Date | null }> {
  const aggregato = await tx.schedulePayment.aggregate({
    where: { scheduleId },
    _sum: { importo: true },
    _max: { dataPagamento: true },
  })

  return {
    pagato: Number(aggregato._sum.importo ?? 0),
    ultimaData: aggregato._max.dataPagamento ?? null,
  }
}

/**
 * Stato che discende dagli importi.
 *
 * `base` è lo stato di partenza (quello attuale, o quello dichiarato da chi
 * chiama). Serve per i due stati che gli importi non sanno esprimere:
 * 'annullata', che è terminale, e 'scaduta', che è un contrassegno su una
 * scadenza non pagata e va conservato finché non arriva un pagamento.
 *
 * Deliberatamente NON si deriva 'scaduta' dal calendario: farlo qui vorrebbe
 * dire che ogni ricalcolo su una scadenza vecchia la contrassegna, cambiando
 * lo stato di righe che nessuno ha toccato.
 */
export function derivaStato(base: string, pagato: number, totale: number): string {
  if (base === 'annullata') return 'annullata'
  if (pagato >= totale - TOLLERANZA_IMPORTI) return 'pagata'
  if (pagato > TOLLERANZA_IMPORTI) return 'parzialmente_pagata'
  return base === 'scaduta' ? 'scaduta' : 'aperta'
}

/**
 * Stato a cui riportare una fattura che non è più interamente pagata.
 *
 * Lo stato precedente non è memorizzato da nessuna parte, quindi non si può
 * "ripristinare": si dichiara il massimo che i dati sanno dimostrare, scendendo
 * la scala del flusso IMPORTED → MATCHED → CATEGORIZED.
 *
 * Il gradino `RECORDED` non c'è più: diceva «le ho scritto un movimento di
 * banca», e dal 15 agosto 2026 un documento fiscale non genera movimenti
 * (spec 2026-08-15-fatture-non-generano-movimenti).
 */
function statoFatturaNonPagata(invoice: {
  accountId: string | null
  supplierId: string | null
}): 'IMPORTED' | 'MATCHED' | 'CATEGORIZED' {
  if (invoice.accountId) return 'CATEGORIZED'
  if (invoice.supplierId) return 'MATCHED'
  return 'IMPORTED'
}

/**
 * Allinea lo stato della fattura alle sue rate, in entrambe le direzioni.
 *
 * PAID solo se almeno una rata è pagata e nessuna è ancora aperta: senza il
 * primo controllo una fattura con tutte le rate annullate risulterebbe pagata.
 */
async function allineaFattura(tx: TransactionClient, invoiceId: string): Promise<void> {
  const invoice = await tx.electronicInvoice.findFirst({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      accountId: true,
      supplierId: true,
    },
  })
  if (!invoice) return

  const [aperte, pagate] = await Promise.all([
    tx.schedule.count({ where: { invoiceId, stato: { notIn: STATI_CHIUSI } } }),
    tx.schedule.count({ where: { invoiceId, stato: 'pagata' } }),
  ])

  if (aperte === 0 && pagate > 0) {
    if (invoice.status !== 'PAID') {
      await tx.electronicInvoice.update({ where: { id: invoiceId }, data: { status: 'PAID' } })
    }
    return
  }

  if (invoice.status === 'PAID') {
    await tx.electronicInvoice.update({
      where: { id: invoiceId },
      data: { status: statoFatturaNonPagata(invoice) },
    })
  }
}

/**
 * Ricalcola stato, importo pagato e date di una scadenza a partire dai suoi
 * pagamenti, e allinea la fattura di origine. Da chiamare DENTRO la transazione
 * che ha appena creato o rimosso pagamenti.
 *
 * Restituisce `null` se la scadenza non esiste (o è cancellata logicamente).
 */
export async function ricalcolaStatoSchedule(
  tx: TransactionClient,
  scheduleId: string,
  opzioni: OpzioniRicalcolo = {}
): Promise<EsitoRicalcolo | null> {
  const schedule = await bloccaScadenza(tx, scheduleId)
  if (!schedule) return null

  const { pagato, ultimaData } = await sommaPagamenti(tx, scheduleId)
  const totale = Number(schedule.importoTotale)

  const base = opzioni.statoDichiarato ?? schedule.stato
  const stato = derivaStato(base, pagato, totale)
  const saldata = stato === 'pagata'

  // La data attesa di cassa segue il fatto reale: quando la scadenza si salda
  // vale la data dell'ultimo pagamento e non è più modificabile a mano. Quando
  // si riapre, l'allineamento decade — ma una data messa a mano, o stimata,
  // resta al suo posto: non è la riconciliazione ad averla scritta.
  const dataAttesa = saldata
    ? { dataAttesa: ultimaData, dataAttesaSource: 'riconciliazione' }
    : schedule.dataAttesaSource === 'riconciliazione'
      ? { dataAttesa: null, dataAttesaSource: null }
      : {}

  await tx.schedule.update({
    where: { id: scheduleId },
    data: {
      importoPagato: new Prisma.Decimal(pagato.toFixed(2)),
      stato,
      dataPagamento: saldata ? ultimaData : null,
      ...dataAttesa,
    },
  })

  if (schedule.invoiceId) {
    await allineaFattura(tx, schedule.invoiceId)
  }

  return {
    scheduleId,
    venueId: schedule.venueId,
    tipo: schedule.tipo,
    supplierId: schedule.supplierId,
    invoiceId: schedule.invoiceId,
    stato,
    statoPrecedente: schedule.stato,
    importoTotale: totale,
    importoPagato: pagato,
    importoResiduo: Math.max(0, totale - pagato),
    dataPagamento: saldata ? ultimaData : null,
    saldata: saldata && schedule.stato !== 'pagata',
    riaperta: !saldata && schedule.stato === 'pagata',
  }
}
