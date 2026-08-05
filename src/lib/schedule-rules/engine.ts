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
 * Oggi l'unico consumatore è l'import delle fatture elettroniche
 * (`POST /api/invoices`), che usa il conto della regola quando chi importa non
 * ne ha indicato uno. Le scadenze (`Schedule`) non hanno un campo conto: fino a
 * quando non esisterà, il motore non ha nulla da valorizzare alla loro
 * creazione (le attive corrisponderebbero ai documenti emessi, le passive ai
 * ricevuti).
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
  contoId: string | null
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

  return { rule, azione: rule.azione, contoId: rule.contoId }
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
