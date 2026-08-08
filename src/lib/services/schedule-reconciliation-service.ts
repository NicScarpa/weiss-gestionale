import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
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
  calcolaPesiDaRighe,
  ripartisciProQuota,
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

  const imputazioni = await tx.invoiceLineAccount.findMany({
    where: { invoiceId },
    select: { accountId: true, importo: true },
  })

  if (imputazioni.length < invoice.lineItems.length) {
    logger.info('Righe fattura non tutte categorizzate: nessuna ereditarietà pro-quota', {
      invoiceId,
      righe: invoice.lineItems.length,
      imputazioni: imputazioni.length,
    })
    return
  }

  const manuali = await tx.journalEntryAllocation.findMany({
    where: { journalEntryId, origine: 'manuale' },
    select: { id: true },
  })
  if (manuali.length > 0) return // le fette manuali vincono sempre

  // Un movimento può riconciliare più scadenze (es. un bonifico cumulativo):
  // ogni riconciliazione calcola la propria quota sul disponibile pieno del
  // movimento, senza sapere quanto le riconciliazioni precedenti hanno già
  // ereditato. Senza questo controllo la somma delle fette può superare
  // l'importo del movimento, rompendo l'invariante che setEntryAllocations
  // difende sullo split manuale. Se sfora, l'ereditarietà si astiene (skip
  // silenzioso, coerente con le altre guardie della funzione): la
  // riconciliazione della scadenza procede comunque.
  const aggregato = await tx.journalEntryAllocation.aggregate({
    where: { journalEntryId },
    _sum: { importo: true },
  })
  const sommaEsistenti = Number(aggregato._sum.importo ?? 0)
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

  const pesi = calcolaPesiDaRighe(
    imputazioni.map((r) => ({ accountId: r.accountId, importo: Number(r.importo) }))
  )
  const fette = ripartisciProQuota(pesi, quota)
  if (fette.length === 0) return

  await tx.journalEntryAllocation.createMany({
    data: fette.map((f) => ({
      journalEntryId,
      accountId: f.accountId,
      importo: new Prisma.Decimal(f.importo.toFixed(2)),
      origine: 'ereditata',
      reconciliationId,
    })),
  })

  await aggiornaContoDominante(tx, journalEntryId)
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
          motivo: `Il movimento è già interamente imputato ad altre scadenze (${utile.toFixed(2)} € impegnati)`,
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
          motivo: `La quota supera il residuo della scadenza (${residuo.toFixed(2)} €)`,
        } as const
      }
      if (quota > disponibile + TOLLERANZA_IMPORTI) {
        return {
          outcome: 'amount_exceeds_capacity',
          motivo: `La quota supera la capienza residua del movimento (${disponibile.toFixed(2)} € ancora liberi su ${utile.toFixed(2)} €)`,
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
