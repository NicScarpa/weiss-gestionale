import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { formatCurrency } from '@/lib/formatters'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import {
  bloccaMovimento,
  bloccaScadenza,
  capienzaResiduaMovimento,
  ricalcolaStatoSchedule,
  sommaPagamenti,
  TOLLERANZA_IMPORTI,
} from '@/lib/scadenzario/stato-schedule'
import {
  aggiornaContoDominante,
  calcolaPesiConIva,
  ripartisciProQuotaConIva,
  type TransactionClient,
} from './allocation-service'

/**
 * Riconciliazione fra movimenti di prima nota e scadenze.
 *
 * Il ciclo che questo modulo chiude: la fattura genera la scadenza, il denaro
 * si muove e produce un movimento, la riconciliazione li unisce e la scadenza
 * si salda. Senza questo passaggio scadenzario e contabilità restano due
 * racconti separati della stessa realtà.
 *
 * Due scelte prese dal modello Sibill:
 * - il rifiuto di una proposta **crea** un record REJECTED invece di
 *   cancellare, così resta traccia di cosa il sistema aveva proposto;
 * - le proposte di match non si persistono, si ricalcolano quando servono.
 *
 * Una divergenza deliberata: sulle riconciliazioni parziali Sibill riscrive lo
 * scadenzario generando una nuova scadenza per il residuo, mentre qui si
 * mantiene `importoPagato`, che il gestionale già gestisce con i pagamenti
 * parziali e la relativa interfaccia.
 */

export type ReconcileOutcome =
  | { outcome: 'ok'; reconciliationId: string; scheduleStato: string; importoPagato: number }
  | { outcome: 'schedule_not_found' }
  | { outcome: 'entry_not_found' }
  | { outcome: 'already_reconciled' }
  | { outcome: 'schedule_closed'; stato: string }
  | { outcome: 'invalid_amount'; motivo: string }
  /** La quota sfora il residuo della scadenza o la capienza del movimento. */
  | { outcome: 'amount_exceeds_capacity'; motivo: string }

interface ReconcileInput {
  scheduleId: string
  journalEntryId: string
  venueId: string
  userId: string | null
  /** Quota imputata alla scadenza: se assente si usa il residuo o l'importo del movimento */
  amount?: number
  source?: 'MANUAL' | 'AUTOMATIC' | 'PROPOSAL' | 'RULE'
  confidence?: number
}

/**
 * Aliquota IVA di ciascuna riga dello snapshot, per numero di linea.
 *
 * Lo snapshot è JSON e arriva dal parser FatturaPA, quindi va trattato come
 * dato esterno: si accettano solo numeri finiti e non negativi, e una riga
 * senza aliquota leggibile semplicemente non entra nella mappa. Le fatture
 * importate da un fornitore che non compila `AliquotaIVA` ricadono così nel
 * comportamento precedente, che è approssimato ma non arbitrario.
 */
function aliquoteDelloSnapshot(lineItems: unknown[]): Map<number, number> {
  const mappa = new Map<number, number>()
  for (const riga of lineItems) {
    if (typeof riga !== 'object' || riga === null) continue
    const { numeroLinea, aliquotaIVA } = riga as Record<string, unknown>
    if (typeof numeroLinea !== 'number' || !Number.isFinite(numeroLinea)) continue
    if (typeof aliquotaIVA !== 'number' || !Number.isFinite(aliquotaIVA) || aliquotaIVA < 0) continue
    mappa.set(numeroLinea, aliquotaIVA)
  }
  return mappa
}

/**
 * Porta sulla testata l'IVA che le fette appena scritte dichiarano.
 *
 * Perché serve. Il movimento che salda una fattura nasce senza IVA su tutti e
 * tre i percorsi automatici — import bancario, motore delle regole,
 * esecuzione di un pagamento — mentre le fette ereditate portano quella
 * esatta di ciascuna aliquota. Il prospetto di cash flow toglie alla testata
 * l'IVA di ogni fetta, e una testata che ne dichiara zero finiva a −122 su
 * una fattura mista da 1.222: un'IVA negativa su un conto, cioè un numero che
 * in questo dominio non esiste. Il prospetto ora si difende da sé con un
 * tetto (vedi `aggregaMovimenti`), ma il tetto da solo avrebbe lasciato in
 * archivio movimenti che dichiarano zero IVA a fronte di un documento che ne
 * ha: il campo vuoto è un difetto del dato, non della lettura.
 *
 * Quando si scrive, in ordine di importanza:
 *
 * 1. **Mai sopra un numero scritto da un essere umano.** Il campo si tocca
 *    solo se è ancora *nostro*: assente, oppure esattamente uguale all'IVA
 *    delle fette che c'erano prima di questa scrittura. Un movimento può
 *    saldare più scadenze e ogni riconciliazione aggiunge le proprie fette:
 *    la regola lascia alla seconda la facoltà di aggiornare il totale, e a
 *    entrambe il divieto di sovrascrivere un valore che non hanno messo loro.
 * 2. **Solo quando l'IVA è davvero nota.** Se una fetta scritta non la
 *    dichiara — la regola del tutto-o-niente le rende esatte o `null` per
 *    fattura intera — la testata resta com'è. Lo stesso se non la dichiara
 *    una fetta preesistente: senza il loro totale non si può nemmeno decidere
 *    se il numero in testata sia nostro.
 *
 * Il valore scritto è un modulo positivo, come fa la registrazione di una
 * fattura in `invoices/[id]/record`: il verso lo decide `ripartisciIva` dal
 * lato valorizzato del movimento. Sui pagamenti parziali non si riscala
 * nulla: le fette sono già state ridotte da `ripartisciProQuotaConIva`,
 * quindi la loro IVA è già quella pagata.
 */
async function aggiornaIvaDiTestata(
  tx: TransactionClient,
  {
    journalEntryId,
    ivaPrecedenti,
    ivaScritte,
  }: {
    journalEntryId: string
    /** L'IVA delle fette già presenti PRIMA di questa scrittura. */
    ivaPrecedenti: (Prisma.Decimal | null)[]
    /** L'IVA delle fette appena scritte. */
    ivaScritte: (number | null)[]
  }
): Promise<void> {
  if (ivaScritte.some((iva) => iva === null)) return
  if (ivaPrecedenti.some((iva) => iva === null)) return

  // I `?? 0` sono irraggiungibili — i due `some` qui sopra hanno già escluso
  // ogni `null` — ma il tipo degli array resta nullable e `reduce` lo eredita.
  const ivaPreesistente = ivaPrecedenti.reduce<number>((s, iva) => s + Number(iva ?? 0), 0)
  const nuovoTotale = ivaScritte.reduce<number>((s, iva) => s + (iva ?? 0), ivaPreesistente)

  const movimento = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    select: { vatAmount: true },
  })
  if (!movimento) return

  if (
    movimento.vatAmount !== null &&
    Math.abs(Number(movimento.vatAmount) - ivaPreesistente) > TOLLERANZA_IMPORTI
  ) {
    logger.info("L'IVA di testata è di qualcun altro: l'ereditarietà non la tocca", {
      journalEntryId,
      dichiarata: Number(movimento.vatAmount),
      ivaDelleFette: nuovoTotale,
    })
    return
  }

  await tx.journalEntry.update({
    where: { id: journalEntryId },
    data: { vatAmount: new Prisma.Decimal(nuovoTotale.toFixed(2)) },
  })
}

/**
 * Eredità pro-quota: se la scadenza viene da una fattura le cui righe sono
 * TUTTE categorizzate per conto, il movimento che la salda eredita le stesse
 * fette (Fase 3). Chiamata dentro la transazione di `reconcileScheduleWithEntry`:
 * non è best-effort, se fallisce la riconciliazione fallisce con lei.
 *
 * Copertura totale: `lineItems` (snapshot JSON delle righe fattura) deve
 * essere un array e ogni riga deve avere una imputazione in
 * `invoice_line_accounts`, proposta o confermata che sia (una riga in
 * tabella conta come categorizzata). Copertura parziale o fattura senza
 * righe estratte → nessuna ereditarietà, silenziosa (solo un log info).
 *
 * Le fette 'manuale' già presenti sul movimento vincono sempre: se ce ne
 * sono, questa funzione è un no-op.
 *
 * L'ereditarietà non rifiuta mai una riconciliazione per il centro di costo —
 * bloccarla per un dato che l'utente non sta toccando sarebbe peggio — ma il
 * centro va comunque rivalutato, e questo è un percorso automatico. Il
 * movimento importato dall'estratto conto nasce senza conto, quindi con il
 * centro che si dà a chi non ne ha uno; il conto arriva solo ora, con le
 * fette della fattura, e può essere di quelli che un centro lo pretendono.
 * Se ne occupa `aggiornaContoDominante` in contesto automatico, che imputa al
 * centro operativo predefinito quanto non è stato scelto da nessuno e lascia
 * il movimento da verificare.
 */
async function ereditaFetteDaFattura(
  tx: TransactionClient,
  {
    journalEntryId,
    invoiceId,
    reconciliationId,
    quota,
    importoUtileMovimento,
  }: {
    journalEntryId: string
    invoiceId: string
    reconciliationId: string
    quota: number
    /** Importo utile del movimento (debit ?? credit): tetto che nessuna fetta, manuale o ereditata, può superare */
    importoUtileMovimento: number
  }
): Promise<void> {
  const invoice = await tx.electronicInvoice.findUnique({
    where: { id: invoiceId },
    select: { lineItems: true },
  })

  if (!invoice || !Array.isArray(invoice.lineItems)) {
    logger.info('Fattura senza righe estratte: nessuna ereditarietà pro-quota', { invoiceId })
    return
  }

  // SOLO le imputazioni che un essere umano ha confermato.
  //
  // Senza questo filtro esisteva un percorso interamente automatico
  // dall'ipotesi del modello fino al conto su cui il budget conta i soldi:
  // le righe 'proposta' — quelle gialle che nessuno ha ancora guardato —
  // pesavano quanto le confermate, `aggiornaContoDominante` riscriveva
  // `JournalEntry.accountId` con il conto della fetta più grossa, e il budget
  // imputava lì l'INTERO importo del movimento. Fattura mista da 1.200 €
  // ipotizzata 700 «Pulizie» / 500 «Alimentari» → 1.200 € su Pulizie.
  //
  // Il conto scelto dal titolare o da una regola dello scadenzario veniva
  // sovrascritto senza avviso, e l'audit registra la riconciliazione ma non la
  // riscrittura del conto: il valore precedente non è salvato da nessuna
  // parte. Un difetto che cancellava le proprie tracce.
  const imputazioni = await tx.invoiceLineAccount.findMany({
    where: { invoiceId, stato: 'confermata' },
    select: { accountId: true, importo: true, numeroLinea: true },
  })

  // La guardia contava le righe senza guardarne lo stato, quindi una fattura
  // interamente gialla la superava. Col filtro sopra, una fattura mezza
  // confermata non arriva al conteggio pieno e l'astensione scatta da sé.
  if (imputazioni.length < invoice.lineItems.length) {
    logger.info('Righe fattura non tutte confermate: nessuna ereditarietà pro-quota', {
      invoiceId,
      righe: invoice.lineItems.length,
      confermate: imputazioni.length,
    })
    return
  }

  // I pesi sono i `PrezzoTotale` delle righe, cioè IMPONIBILI; la quota da
  // ripartire è un pagamento, cioè LORDO. Applicare proporzioni al netto su un
  // importo lordo sbaglia ogni volta che le aliquote non sono uniformi:
  // alimentari 1.000 € + 4% e detersivi 200 € + 22% fanno 1.284 € pagati, ma
  // sui soli imponibili la ripartizione dà 1.070 € e 214 € invece di 1.040 € e
  // 244 €. Trenta euro sul conto sbagliato, il 2,3% della fattura, e su una
  // fattura di sole bevande e detersivi lo scarto è più marcato ancora. Con
  // aliquote uguali fra le righe il fattore si semplifica e non cambia nulla.
  const aliquotePerLinea = aliquoteDelloSnapshot(invoice.lineItems)

  // Le fette già sul movimento, lette una volta sola perché servono a tre
  // cose: sapere se ce n'è una manuale (vince sempre), sommarne gli importi
  // per il tetto di capienza, e sapere quanta IVA dichiarano — è ciò che
  // stabilisce se l'IVA di testata è ancora nostra (`aggiornaIvaDiTestata`).
  const esistenti = await tx.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { origine: true, importo: true, iva: true },
  })
  if (esistenti.some((f) => f.origine === 'manuale')) return // le manuali vincono sempre

  // Un movimento può riconciliare più scadenze (es. un bonifico cumulativo):
  // ogni riconciliazione calcola la propria quota sul disponibile pieno del
  // movimento, senza sapere quanto le riconciliazioni precedenti hanno già
  // ereditato. Senza questo controllo la somma delle fette può superare
  // l'importo del movimento, rompendo l'invariante che setEntryAllocations
  // difende sullo split manuale. Se sfora, l'ereditarietà si astiene (skip
  // silenzioso, coerente con le altre guardie della funzione): la
  // riconciliazione della scadenza procede comunque.
  const sommaEsistenti = esistenti.reduce((s, f) => s + Number(f.importo), 0)
  if (sommaEsistenti + quota > importoUtileMovimento + 0.01) {
    logger.warn('Ereditarietà pro-quota: la quota sforerebbe l\'importo utile del movimento, si salta', {
      journalEntryId,
      invoiceId,
      quota,
      sommaEsistenti,
      importoUtileMovimento,
    })
    return
  }

  const pesi = calcolaPesiConIva(
    imputazioni.map((r) => ({
      accountId: r.accountId,
      imponibile: Number(r.importo),
      aliquota: aliquotePerLinea.get(r.numeroLinea),
    }))
  )
  // Un conto sparito dai pesi è un conto il cui totale non era positivo: una
  // riga di sconto o di reso a `PrezzoTotale` negativo (il parser non
  // normalizza il segno), o due righe che si annullano. La quota si ripartisce
  // comunque fra i conti rimasti, che si prendono anche la parte di quello
  // scartato, IVA compresa: ogni fetta resta fedele alla propria aliquota ma
  // il totale non è più quello del documento. È l'approssimazione minore fra
  // quelle disponibili — il perché, con i numeri, sta nel docblock di
  // `calcolaPesiConIva` — e finché la fase B non farà entrare le righe
  // negative nei pesi col proprio segno, l'unica cosa che si può fare in più
  // è non lasciarla silenziosa.
  const contiImputati = new Set(imputazioni.map((r) => r.accountId)).size
  if (pesi.length < contiImputati) {
    logger.warn('Fattura con righe scartate dai pesi: le fette quadrano con la quota, non con il documento', {
      invoiceId,
      journalEntryId,
      contiImputati,
      contiNeiPesi: pesi.length,
    })
  }

  const fette = ripartisciProQuotaConIva(pesi, quota)
  if (fette.length === 0) return

  await tx.journalEntryAllocation.createMany({
    data: fette.map((f) => ({
      journalEntryId,
      accountId: f.accountId,
      importo: new Prisma.Decimal(f.importo.toFixed(2)),
      iva: f.iva === null ? null : new Prisma.Decimal(f.iva.toFixed(2)),
      origine: 'ereditata',
      reconciliationId,
    })),
  })

  await aggiornaIvaDiTestata(tx, {
    journalEntryId,
    ivaPrecedenti: esistenti.map((f) => f.iva),
    ivaScritte: fette.map((f) => f.iva),
  })

  await aggiornaContoDominante(tx, journalEntryId, 'automatico')
}

/**
 * Collega un movimento a una scadenza e aggiorna lo stato di quest'ultima.
 *
 * Tutto in transazione, letture comprese: prima si bloccano movimento e
 * scadenza (in quest'ordine, sempre: l'ordine inverso in un altro percorso
 * produrrebbe deadlock), poi si decide. Leggere fuori dalla transazione e
 * decidere dentro — come faceva la versione precedente — significa prendere le
 * decisioni su numeri che nel frattempo possono essere cambiati.
 *
 * Due tetti, non uno: la quota non può superare il residuo della *scadenza*,
 * né la capienza ancora libera del *movimento*. Senza il secondo, un bonifico
 * da 100 € poteva figurare come saldo di 500 € di scadenze diverse.
 */
export async function reconcileScheduleWithEntry({
  scheduleId,
  journalEntryId,
  venueId,
  userId,
  amount,
  source = 'MANUAL',
  confidence,
}: ReconcileInput): Promise<ReconcileOutcome> {
  const esegui = () =>
    prisma.$transaction(async (tx) => {
      const entry = await bloccaMovimento(tx, journalEntryId, venueId)
      if (!entry) return { outcome: 'entry_not_found' } as const

      const schedule = await bloccaScadenza(tx, scheduleId, venueId)
      if (!schedule) return { outcome: 'schedule_not_found' } as const

      if (schedule.stato === 'pagata' || schedule.stato === 'annullata') {
        return { outcome: 'schedule_closed', stato: schedule.stato } as const
      }

      const esistente = await tx.scheduleReconciliation.findFirst({
        where: { scheduleId, journalEntryId, status: 'VERIFIED' },
        select: { id: true },
      })
      if (esistente) return { outcome: 'already_reconciled' } as const

      const { utile, disponibile } = await capienzaResiduaMovimento(tx, entry, schedule.tipo)

      if (utile <= 0) {
        return {
          outcome: 'invalid_amount',
          motivo:
            schedule.tipo === 'attiva'
              ? 'Il movimento non è un incasso: non può saldare una scadenza attiva'
              : 'Il movimento non è un\'uscita: non può saldare una scadenza passiva',
        } as const
      }

      if (disponibile <= TOLLERANZA_IMPORTI) {
        return {
          outcome: 'amount_exceeds_capacity',
          motivo: `Il movimento è già interamente imputato ad altre scadenze (${formatCurrency(utile)} impegnati)`,
        } as const
      }

      // Il residuo si ricava dai pagamenti registrati, non dal contatore sulla
      // scadenza: se quel contatore è andato in deriva, la somma lo risana.
      const { pagato } = await sommaPagamenti(tx, scheduleId)
      const residuo = Number(schedule.importoTotale) - pagato

      // Senza indicazione esplicita si imputa il minore fra residuo e capienza
      // del movimento: un bonifico cumulativo copre la scadenza fino a concorrenza
      const quota = amount ?? Math.min(residuo, disponibile)

      if (quota <= 0) {
        return { outcome: 'invalid_amount', motivo: 'La quota da imputare deve essere positiva' } as const
      }
      if (quota > residuo + TOLLERANZA_IMPORTI) {
        return {
          outcome: 'amount_exceeds_capacity',
          motivo: `La quota supera il residuo della scadenza (${formatCurrency(residuo)})`,
        } as const
      }
      if (quota > disponibile + TOLLERANZA_IMPORTI) {
        return {
          outcome: 'amount_exceeds_capacity',
          motivo: `La quota supera la capienza residua del movimento (${formatCurrency(disponibile)} ancora liberi su ${formatCurrency(utile)})`,
        } as const
      }

      const payment = await tx.schedulePayment.create({
        data: {
          scheduleId,
          importo: new Prisma.Decimal(quota.toFixed(2)),
          dataPagamento: entry.date,
          note: `Riconciliato con il movimento: ${entry.description}`,
        },
      })

      const reconciliation = await tx.scheduleReconciliation.create({
        data: {
          scheduleId,
          journalEntryId,
          status: 'VERIFIED',
          source,
          amount: new Prisma.Decimal(quota.toFixed(2)),
          confidence: confidence !== undefined ? new Prisma.Decimal(confidence.toFixed(2)) : null,
          paymentId: payment.id,
          createdById: userId,
        },
      })

      // Aggancio pro-quota (Fase 3): dentro la transazione, non best-effort.
      if (schedule.invoiceId) {
        await ereditaFetteDaFattura(tx, {
          journalEntryId,
          invoiceId: schedule.invoiceId,
          reconciliationId: reconciliation.id,
          quota,
          importoUtileMovimento: utile,
        })
      }

      const stato = await ricalcolaStatoSchedule(tx, scheduleId)
      if (!stato) return { outcome: 'schedule_not_found' } as const

      return { outcome: 'ok', reconciliationId: reconciliation.id, quota, stato } as const
    })

  let risultato: Awaited<ReturnType<typeof esegui>>
  try {
    risultato = await esegui()
  } catch (error) {
    // Rete di sicurezza del vincolo `ux_schedule_reconciliations_coppia_verificata`:
    // se due richieste arrivassero comunque in fondo insieme, la perdente
    // esce da qui come "già riconciliata" invece che come errore interno.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { outcome: 'already_reconciled' }
    }
    throw error
  }

  if (risultato.outcome !== 'ok') {
    return risultato
  }

  // La storia del fornitore è cambiata: le stime delle sue scadenze aperte
  // si aggiornano. Best-effort: non blocca mai la riconciliazione
  if (risultato.stato.saldata && risultato.stato.tipo === 'passiva' && risultato.stato.supplierId) {
    await ricalcolaStimeFornitore(risultato.stato.supplierId, venueId)
  }

  logger.info('Scadenza riconciliata con movimento', {
    scheduleId,
    journalEntryId,
    quota: risultato.quota,
    stato: risultato.stato.stato,
    source,
  })

  return {
    outcome: 'ok',
    reconciliationId: risultato.reconciliationId,
    scheduleStato: risultato.stato.stato,
    importoPagato: risultato.stato.importoPagato,
  }
}

/**
 * Registra il rifiuto di una proposta di match.
 * Non cancella nulla: il record REJECTED è la memoria di ciò che il sistema
 * aveva proposto e l'utente ha scartato, così non lo si ripropone all'infinito.
 */
export async function rejectScheduleMatch({
  scheduleId,
  journalEntryId,
  venueId,
  userId,
  amount = 0,
}: {
  scheduleId: string
  journalEntryId: string
  venueId: string
  userId: string | null
  amount?: number
}): Promise<{ outcome: 'ok'; reconciliationId: string } | { outcome: 'schedule_not_found' }> {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, venueId },
    select: { id: true },
  })

  if (!schedule) return { outcome: 'schedule_not_found' }

  const reconciliation = await prisma.scheduleReconciliation.create({
    data: {
      scheduleId,
      journalEntryId,
      status: 'REJECTED',
      source: 'PROPOSAL',
      amount: new Prisma.Decimal(amount.toFixed(2)),
      createdById: userId,
    },
  })

  return { outcome: 'ok', reconciliationId: reconciliation.id }
}

/**
 * Annulla una riconciliazione: rimuove il pagamento generato e riporta la
 * scadenza allo stato che i pagamenti rimasti descrivono. Serve quando il match
 * si rivela sbagliato.
 *
 * Il ritorno indietro riguarda anche la fattura: prima l'undo cancellava
 * riconciliazione e pagamento ma lasciava `ElectronicInvoice` su PAID, e la
 * fattura restava pagata per sempre. Se ne occupa `ricalcolaStatoSchedule`,
 * che allinea la fattura in entrambe le direzioni.
 */
export async function undoScheduleReconciliation({
  reconciliationId,
  venueId,
}: {
  reconciliationId: string
  venueId: string
}): Promise<{ outcome: 'ok'; scheduleStato: string } | { outcome: 'not_found' }> {
  const riferimento = await prisma.scheduleReconciliation.findFirst({
    where: { id: reconciliationId, status: 'VERIFIED', schedule: { venueId } },
    select: { id: true, scheduleId: true, journalEntryId: true },
  })

  if (!riferimento) return { outcome: 'not_found' }

  const esito = await prisma.$transaction(async (tx) => {
    // Stesso ordine di acquisizione dei lock della riconciliazione
    // (movimento, poi scadenza): invertirlo qui basterebbe a produrre deadlock
    // fra un annullo e una riconciliazione concorrenti.
    const movimento = await bloccaMovimento(tx, riferimento.journalEntryId)
    await bloccaScadenza(tx, riferimento.scheduleId)

    const reconciliation = await tx.scheduleReconciliation.findFirst({
      where: { id: reconciliationId, status: 'VERIFIED' },
      select: { id: true, scheduleId: true, journalEntryId: true, paymentId: true },
    })
    if (!reconciliation) return null

    // Le fette ereditate (Fase 3) vanno ritirate PRIMA di cancellare la
    // riconciliazione: la FK JournalEntryAllocation.reconciliationId è
    // onDelete: SetNull, quindi cancellando prima la riconciliazione il DB
    // azzera solo il riferimento e le fette restano orfane invece di sparire.
    const fetteRitirate = await tx.journalEntryAllocation.deleteMany({
      where: { reconciliationId },
    })

    await tx.scheduleReconciliation.delete({ where: { id: reconciliationId } })

    if (reconciliation.paymentId) {
      await tx.schedulePayment.delete({ where: { id: reconciliation.paymentId } })
    }

    const stato = await ricalcolaStatoSchedule(tx, reconciliation.scheduleId)

    // Nessuna fetta ritirata: niente è cambiato sul movimento, non si tocca
    // (stesso principio del no-op di setEntryAllocations).
    //
    // Il movimento può anche non esserci più: eliminare una chiusura di cassa
    // cancella le scritture che ha generato, riconciliate comprese. L'annullo
    // deve comunque liberare la scadenza — altrimenti resterebbe pagata per
    // sempre a fronte di un movimento inesistente — ma su una riga cancellata
    // non si scrive.
    //
    // Il centro di costo non viene toccato: contesto interattivo, asimmetrico
    // rispetto all'ereditarietà e di proposito. L'undo è un gesto umano
    // deliberato, e il centro precedente non è ripristinabile perché non se ne
    // tiene lo storico. Il movimento conserva quindi il centro che
    // l'ereditarietà gli aveva dato, ma con la sua provenienza: se era
    // 'supposto' resta 'supposto', quindi nessuna automazione lo promuoverà a
    // verificato e la prossima riconciliazione lo rivaluterà da capo.
    if (movimento && fetteRitirate.count > 0) {
      const numeroFette = await aggiornaContoDominante(tx, reconciliation.journalEntryId)
      if (numeroFette === 0) {
        // Fette ereditate ritirate e nessuna residua: il movimento torna alla
        // categorizzazione semplice, accountId resta l'ultimo valorizzato.
        await tx.journalEntry.update({
          where: { id: reconciliation.journalEntryId },
          data: { categorizationSource: 'manual' },
        })
      }
    }

    return stato
  })

  if (!esito) return { outcome: 'not_found' }

  // La scadenza è di nuovo aperta: se il fornitore ha una storia, la data
  // attesa torna a essere stimata invece di restare secca sulla contrattuale
  await applicaStimaSuScadenza(esito.scheduleId, venueId)

  // L'undo toglie anche un'osservazione dalla storia del fornitore: le stime
  // delle sue altre scadenze aperte non devono più incorporare il dato revocato
  if (esito.tipo === 'passiva' && esito.supplierId) {
    await ricalcolaStimeFornitore(esito.supplierId, venueId)
  }

  return { outcome: 'ok', scheduleStato: esito.stato }
}
