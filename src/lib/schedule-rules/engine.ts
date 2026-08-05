/**
 * Motore delle regole dello scadenzario.
 *
 * Una regola (`ScheduleRule`) descrive: "per i documenti di questa direzione,
 * con questo tipo documento e questo tipo pagamento, applica questa azione sul
 * conto indicato". I criteri lasciati vuoti (`null`) valgono come "qualsiasi
 * valore".
 *
 * L'ordine di valutazione è quello esplicito del campo `ordine` (più basso =
 * valutato prima), esattamente come nella UI di riordino: una regola con
 * criteri più specifici NON scavalca una regola più generica messa sopra di
 * lei. La prima regola che corrisponde vince e la valutazione si ferma.
 *
 * L'azione `crea_riconcilia_movimento` fa esattamente quello che dice: quando
 * una scadenza corrisponde ai criteri, genera il movimento di prima nota sul
 * conto BANCARIO indicato dalla regola e lo riconcilia con la scadenza. Serve
 * per ciò che non transita da un estratto conto importato — contanti, POS,
 * addebiti ricorrenti — dove il movimento non arriverebbe mai da solo.
 *
 * Il conto CONTABILE del movimento generato non viene dalla regola: si eredita
 * dal fornitore (`Supplier.defaultAccountId`) o dalle regole di
 * categorizzazione della prima nota. La scadenza non porta imputazione
 * contabile, è il movimento a portarla.
 *
 * Un secondo consumatore è l'import delle fatture elettroniche
 * (`POST /api/invoices`), che usa il conto contabile della regola quando chi
 * importa non ne ha indicato uno: è un residuo dell'interpretazione precedente
 * del campo `contoId`, mantenuto finché i dati non sono migrati.
 */
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  ScheduleDocumentType,
  SchedulePaymentMethod,
  ScheduleRuleDirection,
} from '@/types/schedule'

/**
 * Forma minima di una regola per il matching: compatibile con il record
 * Prisma `ScheduleRule`, ma senza dipendere da esso (così il motore resta
 * testabile senza database).
 */
export interface MatchableScheduleRule {
  id: string
  direzione: string
  tipoDocumento: string | null
  tipoPagamento: string | null
  azione: string
  contoId: string | null
  bankAccountId?: string | null
  ordine: number
  isActive?: boolean
}

/** Caratteristiche del documento/scadenza da confrontare con le regole. */
export interface ScheduleRuleContext {
  direzione: ScheduleRuleDirection | string
  tipoDocumento?: string | null
  tipoPagamento?: string | null
}

export interface ScheduleRuleMatch<T extends MatchableScheduleRule = MatchableScheduleRule> {
  rule: T
  azione: string
  /** Conto contabile: residuo dell'interpretazione precedente del campo */
  contoId: string | null
  /** Conto bancario su cui creare il movimento quando la regola si applica */
  bankAccountId: string | null
}

/** Un criterio nullo sulla regola è un jolly; altrimenti serve uguaglianza esatta. */
function criterioSoddisfatto(criterio: string | null | undefined, valore: string | null | undefined): boolean {
  if (criterio === null || criterio === undefined) return true
  if (!valore) return false
  return criterio === valore
}

/**
 * Restituisce la prima regola applicabile al contesto, o `null`.
 * Funzione pura: l'ordinamento per `ordine` viene riapplicato qui, così il
 * risultato non dipende dall'ordine con cui il chiamante passa le regole.
 */
export function trovaRegolaApplicabile<T extends MatchableScheduleRule>(
  context: ScheduleRuleContext,
  rules: T[]
): ScheduleRuleMatch<T> | null {
  const rule = rules
    .filter((r) => r.isActive !== false)
    .filter((r) => r.direzione === context.direzione)
    .slice()
    .sort((a, b) => a.ordine - b.ordine)
    .find(
      (r) =>
        criterioSoddisfatto(r.tipoDocumento, context.tipoDocumento) &&
        criterioSoddisfatto(r.tipoPagamento, context.tipoPagamento)
    )

  if (!rule) return null

  return {
    rule,
    azione: rule.azione,
    contoId: rule.contoId,
    bankAccountId: 'bankAccountId' in rule ? (rule.bankAccountId as string | null) : null,
  }
}

/**
 * Traduce il TipoDocumento FatturaPA nel vocabolario usato dalle regole.
 * I codici non riconosciuti restituiscono `null`: il contesto resterà senza
 * tipo documento e potranno matchare solo le regole con il criterio a jolly.
 */
export function tipoDocumentoDaCodiceSdi(
  codice: string | null | undefined,
  direzione: ScheduleRuleDirection
): ScheduleDocumentType | null {
  if (!codice) return null

  if (codice === 'TD04') return ScheduleDocumentType.NOTA_CREDITO
  if (codice === 'TD05') return ScheduleDocumentType.NOTA_DEBITO

  if (!/^TD\d{2}$/.test(codice)) return null

  return direzione === ScheduleRuleDirection.EMESSI
    ? ScheduleDocumentType.FATTURA_VENDITA
    : ScheduleDocumentType.FATTURA_ACQUISTO
}

/** ModalitaPagamento FatturaPA → vocabolario delle regole. */
const MODALITA_PAGAMENTO_SDI: Record<string, SchedulePaymentMethod> = {
  MP01: SchedulePaymentMethod.CONTANTI,
  MP02: SchedulePaymentMethod.ASSEGNO,
  MP03: SchedulePaymentMethod.ASSEGNO,
  MP04: SchedulePaymentMethod.CONTANTI,
  MP05: SchedulePaymentMethod.BONIFICO,
  MP07: SchedulePaymentMethod.BOLLETTINO,
  MP08: SchedulePaymentMethod.CARTA,
  MP09: SchedulePaymentMethod.SDD,
  MP10: SchedulePaymentMethod.SDD,
  MP11: SchedulePaymentMethod.SDD,
  MP12: SchedulePaymentMethod.RIBA,
  MP13: SchedulePaymentMethod.BOLLETTINO,
  MP16: SchedulePaymentMethod.SDD,
  MP17: SchedulePaymentMethod.SDD,
  MP18: SchedulePaymentMethod.BOLLETTINO,
  MP19: SchedulePaymentMethod.SDD,
  MP20: SchedulePaymentMethod.SDD,
  MP21: SchedulePaymentMethod.SDD,
}

export function tipoPagamentoDaCodiceSdi(
  codice: string | null | undefined
): SchedulePaymentMethod | null {
  if (!codice) return null
  return MODALITA_PAGAMENTO_SDI[codice] ?? null
}

/**
 * Carica le regole attive della sede e restituisce la prima applicabile.
 */
export async function risolviRegolaScadenza(
  context: ScheduleRuleContext & { venueId: string }
): Promise<ScheduleRuleMatch | null> {
  const rules = await prisma.scheduleRule.findMany({
    where: {
      venueId: context.venueId,
      direzione: context.direzione as string,
      isActive: true,
    },
    orderBy: { ordine: 'asc' },
    select: {
      id: true,
      direzione: true,
      tipoDocumento: true,
      tipoPagamento: true,
      azione: true,
      contoId: true,
      bankAccountId: true,
      ordine: true,
      isActive: true,
    },
  })

  return trovaRegolaApplicabile(context, rules)
}

export interface ContoDaRegola {
  contoId: string
  ruleId: string
  azione: string
}

/**
 * Risolve il conto contabile da assegnare a un documento in base alle regole.
 *
 * Restituisce `null` se nessuna regola corrisponde, se la regola vincente non
 * indica un conto, o se il conto indicato non è più attivo. Non solleva mai:
 * un'automazione rotta non deve impedire l'import di un documento.
 */
export async function risolviContoDaRegole(
  context: ScheduleRuleContext & { venueId: string }
): Promise<ContoDaRegola | null> {
  try {
    const match = await risolviRegolaScadenza(context)
    if (!match?.contoId) return null

    const conto = await prisma.account.findUnique({
      where: { id: match.contoId },
      select: { id: true, isActive: true },
    })

    if (!conto?.isActive) {
      logger.warn('Regola scadenzario ignorata: conto mancante o non attivo', {
        ruleId: match.rule.id,
        contoId: match.contoId,
      })
      return null
    }

    return { contoId: conto.id, ruleId: match.rule.id, azione: match.azione }
  } catch (error) {
    logger.error('Errore nella risoluzione delle regole scadenzario', error, {
      venueId: context.venueId,
      direzione: String(context.direzione),
    })
    return null
  }
}

/**
 * Applica l'azione `crea_riconcilia_movimento` a una scadenza.
 *
 * Genera il movimento di prima nota sul conto bancario indicato dalla regola e
 * lo riconcilia con la scadenza, che risulta così saldata. È il meccanismo che
 * serve per ciò che non transita da un estratto conto importato: contanti,
 * POS, addebiti automatici. Senza, quei pagamenti resterebbero da registrare a
 * mano uno per uno.
 *
 * Il conto contabile del movimento si eredita dal fornitore della scadenza,
 * non dalla regola: l'imputazione appartiene al movimento, e il fornitore è
 * chi la conosce meglio.
 *
 * Non solleva mai: un'automazione che si rompe non deve impedire la creazione
 * della scadenza.
 */
export async function applicaRegolaCreaMovimento(params: {
  scheduleId: string
  venueId: string
  userId: string | null
}): Promise<{ applicata: boolean; motivo?: string; journalEntryId?: string }> {
  try {
    const schedule = await prisma.schedule.findFirst({
      where: { id: params.scheduleId, venueId: params.venueId },
      select: {
        id: true,
        tipo: true,
        stato: true,
        descrizione: true,
        importoTotale: true,
        importoPagato: true,
        dataScadenza: true,
        tipoDocumento: true,
        metodoPagamento: true,
        numeroDocumento: true,
        controparteNome: true,
        supplierId: true,
        supplier: { select: { defaultAccountId: true } },
      },
    })

    if (!schedule) return { applicata: false, motivo: 'scadenza non trovata' }
    if (schedule.stato === 'pagata' || schedule.stato === 'annullata') {
      return { applicata: false, motivo: `scadenza ${schedule.stato}` }
    }

    const direzione =
      schedule.tipo === 'attiva' ? ScheduleRuleDirection.EMESSI : ScheduleRuleDirection.RICEVUTI

    const match = await risolviRegolaScadenza({
      venueId: params.venueId,
      direzione,
      tipoDocumento: schedule.tipoDocumento as ScheduleDocumentType | null,
      tipoPagamento: schedule.metodoPagamento as SchedulePaymentMethod | null,
    })

    if (!match) return { applicata: false, motivo: 'nessuna regola corrispondente' }
    if (!match.bankAccountId) {
      return { applicata: false, motivo: 'la regola non indica un conto bancario' }
    }

    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: match.bankAccountId, venueId: params.venueId, isActive: true },
      select: { id: true, name: true, accountType: true },
    })

    if (!bankAccount) {
      return { applicata: false, motivo: 'conto bancario della regola non disponibile' }
    }

    const residuo = Number(schedule.importoTotale) - Number(schedule.importoPagato)
    if (residuo <= 0) return { applicata: false, motivo: 'nessun residuo da saldare' }

    const isIncasso = schedule.tipo === 'attiva'

    const entry = await prisma.journalEntry.create({
      data: {
        venueId: params.venueId,
        date: schedule.dataScadenza,
        registerType: bankAccount.accountType,
        description: schedule.descrizione,
        documentRef: schedule.numeroDocumento,
        debitAmount: isIncasso ? residuo : null,
        creditAmount: isIncasso ? null : residuo,
        // L'imputazione contabile viene dal fornitore, non dalla regola
        accountId: schedule.supplier?.defaultAccountId ?? null,
        counterpartName: schedule.controparteNome,
        categorizationSource: 'rule',
        createdById: params.userId,
      },
    })

    const { reconcileScheduleWithEntry } = await import(
      '@/lib/services/schedule-reconciliation-service'
    )

    const esito = await reconcileScheduleWithEntry({
      scheduleId: schedule.id,
      journalEntryId: entry.id,
      venueId: params.venueId,
      userId: params.userId,
      source: 'RULE',
    })

    if (esito.outcome !== 'ok') {
      // Il movimento è stato creato ma non si è potuto riconciliare: lo si
      // lascia in prima nota, dove resta visibile e riconciliabile a mano
      logger.warn('Regola: movimento creato ma non riconciliato', {
        scheduleId: schedule.id,
        journalEntryId: entry.id,
        esito: esito.outcome,
      })
      return { applicata: false, motivo: `riconciliazione fallita: ${esito.outcome}`, journalEntryId: entry.id }
    }

    logger.info('Regola scadenzario applicata: movimento creato e riconciliato', {
      scheduleId: schedule.id,
      journalEntryId: entry.id,
      ruleId: match.rule.id,
      bankAccountId: bankAccount.id,
    })

    return { applicata: true, journalEntryId: entry.id }
  } catch (error) {
    logger.error('Errore applicazione regola scadenzario', error, {
      scheduleId: params.scheduleId,
    })
    return { applicata: false, motivo: 'errore interno' }
  }
}
