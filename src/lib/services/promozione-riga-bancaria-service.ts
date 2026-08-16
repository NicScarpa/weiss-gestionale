import { Prisma } from '@prisma/client'
import { prisma, type TransactionClient } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toDebitCredit } from '@/lib/prima-nota-utils'
import {
  risolviCentroDiCosto,
  centroDaRiproporre,
  trovaCentroStrutturale,
} from '@/lib/services/cost-center-service'
import { TOLLERANZA_IMPORTI, type EsitoRicalcolo } from '@/lib/scadenzario/stato-schedule'
import {
  riconciliaInTransazione,
  dopoLaRiconciliazione,
  annullaRiconciliazioneInTransazione,
  dopoAnnulloRiconciliazione,
  type EsitoInterno,
  type ReconcileInput,
} from '@/lib/services/schedule-reconciliation-service'
import { ricalcolaResiduoDocumenti } from '@/lib/banca/residuo-documenti'

/**
 * La promozione di una riga dell'estratto conto a scrittura di prima nota:
 * «l'anello che manca» della spec madre, costruito una volta e usato da
 * Categorizza, Collega fattura e dall'approvazione delle proposte (A2).
 *
 * Spec: docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md,
 * «promuoviRigaBancaria, il servizio unico».
 *
 * Tutto in una transazione: la scrittura si CREA se la riga non ne ha, si
 * RIUSA se `matchedEntryId` è già valorizzato, si LEGA se arriva
 * `scritturaEsistenteId` (la R4); poi una riconciliazione per scadenza; la
 * riga passa a MANUAL (utente) o MATCHED (proposta). Un esito negativo dentro
 * la transazione è un'eccezione (`PromozioneRifiutata`) che la fa cadere per
 * intero: mai una scrittura scritta a metà.
 */

export type OriginePromozione = 'categorizza' | 'collega' | 'proposta'

const ORIGINE_SCRITTURA = {
  categorizza: 'CATEGORIZZA',
  collega: 'COLLEGA',
  proposta: 'PROPOSTA',
} as const

export interface Imputazione {
  accountId: string
  costCenterId?: string
}

export interface InputPromozione {
  bankTransactionId: string
  venueId: string
  userId: string | null
  origine: OriginePromozione
  imputazione?: Imputazione
  scadenze?: Array<{ scheduleId: string; amount: number }>
  /** La R4: la riga si lega a una scrittura che esiste già, non se ne crea una. */
  scritturaEsistenteId?: string
  /** Punteggio della proposta (0-1): finisce su `ScheduleReconciliation.confidence` e su `matchConfidence`. */
  confidence?: number
}

export type EsitoPromozione =
  | { outcome: 'ok'; journalEntryId: string; reconciliationIds: string[]; residuo: number; creata: boolean }
  | { outcome: 'riga_non_trovata' }
  | { outcome: 'riga_nel_cestino' }
  | { outcome: 'riga_gia_collegata'; journalEntryId: string }
  | { outcome: 'importo_eccedente'; residuo: number }
  | { outcome: 'scrittura_non_trovata' }
  | { outcome: 'scrittura_gia_collegata_ad_altra_riga' }
  | { outcome: 'imputazione_non_valida'; motivo: string; code?: string }
  | { outcome: 'riconciliazione_rifiutata'; scheduleId: string; motivo: string }

/**
 * Un esito negativo sollevato DENTRO la transazione: la fa cadere per intero
 * e chi l'ha aperta lo traduce in esito (`promuoviRigaBancaria` qui sotto, o
 * l'approvazione delle proposte nell'A2).
 */
export class PromozioneRifiutata extends Error {
  readonly esito: Exclude<EsitoPromozione, { outcome: 'ok' }>

  constructor(esito: Exclude<EsitoPromozione, { outcome: 'ok' }>) {
    super(esito.outcome)
    this.name = 'PromozioneRifiutata'
    this.esito = esito
  }
}

/** Ciò che la transazione restituisce e che il chiamante completa fuori da essa. */
export interface PromozioneInTransazione {
  esito: Extract<EsitoPromozione, { outcome: 'ok' }>
  /** Le riconciliazioni scritte, per `dopoLaRiconciliazione` fuori dalla transazione. */
  seguiti: Array<{ risultato: EsitoInterno; input: ReconcileInput }>
}

function arrotonda(n: number): number {
  return Math.round(n * 100) / 100
}

function motivoRifiuto(esito: EsitoInterno): string {
  switch (esito.outcome) {
    case 'schedule_not_found':
      return 'Scadenza non trovata'
    case 'entry_not_found':
      return 'Scrittura non trovata'
    case 'already_reconciled':
      return 'La scadenza è già riconciliata con questa scrittura'
    case 'schedule_closed':
      return `La scadenza è ${esito.stato}`
    case 'invalid_amount':
    case 'amount_exceeds_capacity':
      return esito.motivo
    default:
      return 'Riconciliazione rifiutata'
  }
}

/**
 * La violazione di unicità riguarda il legame riga → scrittura
 * (`bank_transactions.matched_entry_id`)?
 *
 * `meta.target` è un array di colonne con l'adapter pg, ma la libreria lo
 * documenta anche come stringa: si accettano entrambe le forme, e quando non
 * si capisce si risponde di no. Sotto questa transazione ci sono altri vincoli
 * di unicità — la coppia già riconciliata dello scadenzario, per dirne uno — e
 * tradurli tutti in «la scrittura è già collegata a un'altra riga» direbbe a
 * chi legge una cosa falsa.
 */
function violaLegameConLaScrittura(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target
  if (Array.isArray(target)) return target.some((colonna) => String(colonna).includes('matched_entry_id'))
  if (typeof target === 'string') return target.includes('matched_entry_id')
  return false
}

/** Il conto dell'imputazione deve esistere ed essere attivo: un id sbagliato è un 400, non una FK violata. */
async function esigiConto(tx: TransactionClient, accountId: string): Promise<void> {
  const conto = await tx.account.findFirst({ where: { id: accountId, isActive: true }, select: { id: true } })
  if (!conto) {
    throw new PromozioneRifiutata({ outcome: 'imputazione_non_valida', motivo: 'Conto inesistente o disattivato' })
  }
}

/**
 * Categorizza su una riga già promossa: aggiorna conto e centro della
 * scrittura collegata (spec, «Le azioni»). Con le fette il conto lo governa la
 * suddivisione (`aggiornaContoDominante`): riscriverlo qui darebbe un conto che
 * nessuna fetta sostiene, come già rifiutano `PUT /api/prima-nota/[id]` e
 * `categorize`.
 */
async function aggiornaImputazione(tx: TransactionClient, journalEntryId: string, imputazione: Imputazione): Promise<void> {
  const scrittura = await tx.journalEntry.findFirst({
    where: { id: journalEntryId },
    select: {
      id: true,
      costCenterId: true,
      costCenterSource: true,
      _count: { select: { allocations: true } },
    },
  })
  if (!scrittura) throw new PromozioneRifiutata({ outcome: 'scrittura_non_trovata' })
  if (scrittura._count.allocations > 0) {
    throw new PromozioneRifiutata({
      outcome: 'imputazione_non_valida',
      motivo: 'La scrittura è ripartita su più conti dalla fattura: si modifica dalla prima nota',
    })
  }
  await esigiConto(tx, imputazione.accountId)
  // Il conto cambia, il centro non per forza: se qualcuno l'aveva scelto, si
  // ripropone e vince: una scelta umana non si riscrive mai. È la stessa
  // regola del batch di ricategorizzazione e dell'ereditarietà delle fette
  // (`centroDaRiproporre`). Senza, ricategorizzare senza ripassare il centro
  // faceva scendere un WEISS scelto a mano allo STR dettato dalla regola del
  // conto nuovo, e la provenienza da 'scelto' a 'piano'.
  const strutturale = await trovaCentroStrutturale(tx)
  const centro = await risolviCentroDiCosto(
    tx,
    {
      accountId: imputazione.accountId,
      costCenterId:
        imputazione.costCenterId ?? centroDaRiproporre(scrittura, strutturale?.id ?? null),
    },
    'interattivo'
  )
  if (centro.outcome === 'invalid') {
    throw new PromozioneRifiutata({ outcome: 'imputazione_non_valida', motivo: centro.motivo, code: centro.code })
  }
  await tx.journalEntry.update({
    where: { id: journalEntryId },
    data: {
      accountId: imputazione.accountId,
      costCenterId: centro.costCenterId,
      costCenterSource: centro.origine,
      categorizationSource: 'manual',
      verified: centro.origine !== 'supposto',
    },
  })
}

/**
 * Il corpo della promozione, dentro una transazione GIÀ APERTA. Lancia
 * `PromozioneRifiutata` per ogni esito negativo: la transazione cade e chi
 * l'ha aperta la traduce. Chi la chiama deve poi passare ogni voce di
 * `seguiti` a `dopoLaRiconciliazione`, fuori dalla transazione.
 */
export async function promuoviRigaBancariaInTransazione(
  tx: TransactionClient,
  input: InputPromozione
): Promise<PromozioneInTransazione> {
  const { bankTransactionId, venueId, userId, origine } = input

  // Il lock sulla riga serializza due promozioni della stessa riga: la seconda
  // vede la prima già scritta invece di creare due scritture.
  await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${bankTransactionId} FOR UPDATE`

  const riga = await tx.bankTransaction.findFirst({
    where: { id: bankTransactionId, venueId, deletedAt: null },
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      description: true,
      descrizione: true,
      matchedEntryId: true,
      origineScrittura: true,
    },
  })
  if (!riga) {
    const cestinata = await tx.bankTransaction.findFirst({
      where: { id: bankTransactionId, venueId, deletedAt: { not: null } },
      select: { id: true },
    })
    throw new PromozioneRifiutata(cestinata ? { outcome: 'riga_nel_cestino' } : { outcome: 'riga_non_trovata' })
  }

  const importo = arrotonda(Math.abs(Number(riga.amount)))
  const verso = Number(riga.amount) > 0 ? 'INCASSO' : 'USCITA'
  const scadenze = input.scadenze ?? []

  // Le scadenze si leggono PRIMA di creare la scrittura: il fornitore e la
  // fattura della prima decidono il conto e il riferimento del documento.
  const scadenzeLette =
    scadenze.length > 0
      ? await tx.schedule.findMany({
          where: { id: { in: scadenze.map((s) => s.scheduleId) }, venueId },
          select: {
            id: true,
            numeroDocumento: true,
            supplier: { select: { name: true, defaultAccountId: true } },
            invoice: { select: { accountId: true, invoiceNumber: true } },
          },
        })
      : []
  for (const s of scadenze) {
    if (!scadenzeLette.some((l) => l.id === s.scheduleId)) {
      throw new PromozioneRifiutata({ outcome: 'riconciliazione_rifiutata', scheduleId: s.scheduleId, motivo: 'Scadenza non trovata' })
    }
  }
  const primaScadenza = scadenze.length > 0 ? (scadenzeLette.find((l) => l.id === scadenze[0].scheduleId) ?? null) : null

  let journalEntryId: string
  let creata = false

  if (input.scritturaEsistenteId) {
    // La R4: si lega, non si crea.
    if (riga.matchedEntryId && riga.matchedEntryId !== input.scritturaEsistenteId) {
      throw new PromozioneRifiutata({ outcome: 'riga_gia_collegata', journalEntryId: riga.matchedEntryId })
    }
    const scrittura = await tx.journalEntry.findFirst({
      where: { id: input.scritturaEsistenteId, venueId, registerType: 'BANK' },
      select: { id: true, debitAmount: true, creditAmount: true, bankTransaction: { select: { id: true } } },
    })
    if (!scrittura) throw new PromozioneRifiutata({ outcome: 'scrittura_non_trovata' })
    if (scrittura.bankTransaction && scrittura.bankTransaction.id !== riga.id) {
      throw new PromozioneRifiutata({ outcome: 'scrittura_gia_collegata_ad_altra_riga' })
    }
    // Il verso deve combaciare: un'entrata della banca non si lega a un'uscita.
    const scritturaEntra = Number(scrittura.debitAmount ?? 0) > 0
    if (scritturaEntra !== (verso === 'INCASSO')) {
      throw new PromozioneRifiutata({
        outcome: 'imputazione_non_valida',
        motivo: 'La scrittura ha il verso opposto a quello del movimento bancario',
      })
    }
    journalEntryId = scrittura.id
  } else if (riga.matchedEntryId) {
    // Già promossa: si riusa la scrittura; con un'imputazione la si aggiorna.
    journalEntryId = riga.matchedEntryId
    if (input.imputazione) await aggiornaImputazione(tx, journalEntryId, input.imputazione)
  } else {
    // Si crea (spec madre, «Cosa succede approvando», terzo caso): registro
    // BANK, data e importo della riga, verso dal segno, conto dall'imputazione
    // o dal fornitore della scadenza — mai da una regola.
    if (input.imputazione) await esigiConto(tx, input.imputazione.accountId)
    const accountId =
      input.imputazione?.accountId ??
      primaScadenza?.supplier?.defaultAccountId ??
      primaScadenza?.invoice?.accountId ??
      null
    // Con un'imputazione c'è un umano davanti a un form che ha il campo del
    // centro (contesto interattivo); senza, nessuno può sceglierlo adesso e il
    // sistema suppone (automatico), lasciando la scrittura da verificare.
    const centro = await risolviCentroDiCosto(
      tx,
      { accountId, costCenterId: input.imputazione?.costCenterId ?? null },
      input.imputazione ? 'interattivo' : 'automatico'
    )
    if (centro.outcome === 'invalid') {
      throw new PromozioneRifiutata({ outcome: 'imputazione_non_valida', motivo: centro.motivo, code: centro.code })
    }
    const { debitAmount, creditAmount } = toDebitCredit('BANK', verso, new Prisma.Decimal(importo.toFixed(2)))
    const scrittura = await tx.journalEntry.create({
      data: {
        venueId,
        date: riga.transactionDate,
        registerType: 'BANK',
        entryType: verso,
        description: riga.descrizione ?? riga.description,
        documentRef:
          scadenzeLette.length === 1
            ? (primaScadenza?.numeroDocumento ?? primaScadenza?.invoice?.invoiceNumber ?? null)
            : null,
        counterpartName: primaScadenza?.supplier?.name ?? null,
        debitAmount,
        creditAmount,
        accountId,
        costCenterId: centro.costCenterId,
        costCenterSource: centro.origine,
        categorizationSource: input.imputazione ? 'manual' : accountId ? 'automatic' : null,
        // Una supposizione sul centro richiede uno sguardo umano; tutto il
        // resto l'ha deciso una persona o il piano dei conti.
        verified: centro.origine !== 'supposto',
        createdById: userId,
      },
      select: { id: true },
    })
    journalEntryId = scrittura.id
    creata = true
  }

  if (riga.matchedEntryId !== journalEntryId) {
    await tx.bankTransaction.update({
      where: { id: riga.id },
      data: {
        matchedEntryId: journalEntryId,
        status: origine === 'proposta' ? 'MATCHED' : 'MANUAL',
        reconciledBy: userId,
        reconciledAt: new Date(),
        matchConfidence: input.confidence !== undefined ? new Prisma.Decimal(input.confidence.toFixed(2)) : null,
        origineScrittura: creata ? ORIGINE_SCRITTURA[origine] : null,
      },
    })
  }

  // La somma delle riconciliazioni non supera l'importo della RIGA: si
  // controlla prima di scriverne una, così l'eccedenza torna come esito col
  // residuo e non come rifiuto della seconda gamba.
  //
  // `riconciliaInTransazione` misura invece la capienza della SCRITTURA. Le
  // due cifre coincidono quando la scrittura nasce dalla riga — è l'importo
  // della riga, copiato — ma non nella R4, dove la scrittura esisteva già e
  // può valere altro: là il tetto più stretto lo mette lei, e l'eccedenza
  // esce da questo ciclo come `riconciliazione_rifiutata` con il motivo che
  // la riconciliazione stessa formula.
  const reconciliationIds: string[] = []
  const seguiti: PromozioneInTransazione['seguiti'] = []
  if (scadenze.length > 0) {
    const gia = await tx.scheduleReconciliation.aggregate({
      where: { journalEntryId, status: 'VERIFIED' },
      _sum: { amount: true },
    })
    const capienza = arrotonda(importo - Number(gia._sum.amount ?? 0))
    const richiesto = arrotonda(scadenze.reduce((somma, s) => somma + s.amount, 0))
    if (richiesto > capienza + TOLLERANZA_IMPORTI) {
      // Nella R4 la scrittura può già portare riconciliazioni per più
      // dell'importo della riga, e la capienza viene negativa: quello che
      // resta da coprire, però, è zero — un residuo sotto zero non significa
      // niente per chi legge l'esito.
      throw new PromozioneRifiutata({ outcome: 'importo_eccedente', residuo: Math.max(0, capienza) })
    }
    for (const s of scadenze) {
      const ingresso: ReconcileInput = {
        scheduleId: s.scheduleId,
        journalEntryId,
        venueId,
        userId,
        amount: s.amount,
        source: origine === 'proposta' ? 'PROPOSAL' : 'MANUAL',
        confidence: input.confidence,
      }
      const risultato = await riconciliaInTransazione(tx, ingresso)
      if (risultato.outcome !== 'ok') {
        throw new PromozioneRifiutata({
          outcome: 'riconciliazione_rifiutata',
          scheduleId: s.scheduleId,
          motivo: motivoRifiuto(risultato),
        })
      }
      reconciliationIds.push(risultato.reconciliationId)
      seguiti.push({ risultato, input: ingresso })
    }
  }

  const residuo = (await ricalcolaResiduoDocumenti(tx, journalEntryId)) ?? 0

  return { esito: { outcome: 'ok', journalEntryId, reconciliationIds, residuo, creata }, seguiti }
}

/**
 * La promozione con la propria transazione: Categorizza e Collega entrano da
 * qui. L'approvazione delle proposte (A2) entra da
 * `promuoviRigaBancariaInTransazione`, perché deve bloccare la proposta e
 * promuovere nello stesso atto.
 */
export async function promuoviRigaBancaria(input: InputPromozione): Promise<EsitoPromozione> {
  let interno: PromozioneInTransazione
  try {
    interno = await prisma.$transaction((tx) => promuoviRigaBancariaInTransazione(tx, input))
  } catch (error) {
    if (error instanceof PromozioneRifiutata) return error.esito
    // La corsa sull'unicità di `matchedEntryId`: due righe che si legano alla
    // stessa scrittura nello stesso istante; la perdente esce come esito e non
    // come guasto del server. Solo quel vincolo, però: ogni altra P2002 è un
    // guasto vero e deve salire.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      violaLegameConLaScrittura(error)
    ) {
      return { outcome: 'scrittura_gia_collegata_ad_altra_riga' }
    }
    throw error
  }

  // Fuori dalla transazione: stime del fornitore e log, per ciascuna gamba.
  for (const seguito of interno.seguiti) {
    await dopoLaRiconciliazione(seguito.risultato, seguito.input)
  }

  logger.info('Riga bancaria promossa a scrittura di prima nota', {
    bankTransactionId: input.bankTransactionId,
    journalEntryId: interno.esito.journalEntryId,
    origine: input.origine,
    creata: interno.esito.creata,
    riconciliazioni: interno.esito.reconciliationIds.length,
    residuo: interno.esito.residuo,
  })

  return interno.esito
}

export type EsitoScollegamento =
  | { outcome: 'ok'; scritturaRitirata: boolean; riconciliazioniAnnullate: number }
  | { outcome: 'riga_non_trovata' }

/**
 * Lo scollegamento: toglie le riconciliazioni e, se la scrittura l'aveva
 * creata la promozione (`origineScrittura` non nullo), la ritira in
 * cancellazione logica; azzera il legame e la riga torna PENDING. Se la
 * scrittura esisteva già (R4), la si slega e basta: le sue riconciliazioni sono
 * sue. Una riga senza scrittura ma con uno stato di abbinamento (vecchio
 * motore) torna semplicemente PENDING: non è un errore.
 */
export async function scollegaRigaBancaria(input: {
  bankTransactionId: string
  venueId: string
  userId: string | null
}): Promise<EsitoScollegamento> {
  const interno = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${input.bankTransactionId} FOR UPDATE`
    const riga = await tx.bankTransaction.findFirst({
      where: { id: input.bankTransactionId, venueId: input.venueId, deletedAt: null },
      select: { id: true, matchedEntryId: true, origineScrittura: true },
    })
    if (!riga) return null

    const esitiAnnullo: EsitoRicalcolo[] = []
    let scritturaRitirata = false

    if (riga.matchedEntryId && riga.origineScrittura !== null) {
      // La scrittura è nostra: prima le sue riconciliazioni (con pagamenti,
      // fette e stato delle scadenze), poi lei — in cancellazione logica, come
      // ogni scrittura contabile.
      const riconciliazioni = await tx.scheduleReconciliation.findMany({
        where: { journalEntryId: riga.matchedEntryId, status: 'VERIFIED' },
        select: { id: true },
      })
      for (const r of riconciliazioni) {
        const esito = await annullaRiconciliazioneInTransazione(tx, r.id)
        if (esito) esitiAnnullo.push(esito)
      }
      await tx.journalEntry.update({
        where: { id: riga.matchedEntryId },
        data: { deletedAt: new Date(), deletedById: input.userId },
      })
      scritturaRitirata = true
    }

    await tx.bankTransaction.update({
      where: { id: riga.id },
      data: {
        matchedEntryId: null,
        origineScrittura: null,
        status: 'PENDING',
        reconciledBy: null,
        reconciledAt: null,
        matchConfidence: null,
        residuoDocumenti: null,
      },
    })

    return { scritturaRitirata, riconciliazioniAnnullate: esitiAnnullo.length, esitiAnnullo }
  })

  if (!interno) return { outcome: 'riga_non_trovata' }

  for (const esito of interno.esitiAnnullo) {
    await dopoAnnulloRiconciliazione(esito, input.venueId)
  }

  logger.info('Riga bancaria scollegata', {
    bankTransactionId: input.bankTransactionId,
    scritturaRitirata: interno.scritturaRitirata,
    riconciliazioniAnnullate: interno.riconciliazioniAnnullate,
  })

  return {
    outcome: 'ok',
    scritturaRitirata: interno.scritturaRitirata,
    riconciliazioniAnnullate: interno.riconciliazioniAnnullate,
  }
}
