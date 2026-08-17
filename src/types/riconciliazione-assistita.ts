/**
 * Il contratto che `GET /api/riconciliazione-assistita/lotti/[id]` mette in
 * mano alla coda di revisione.
 *
 * **Gli importi arrivano come stringhe.** Sono `Decimal` di Prisma, e il
 * `toJSON` di un Decimal è la sua rappresentazione testuale: la rotta non li
 * converte, quindi `459.80` attraversa la rete come `"459.80"`. Il tipo lo dice
 * invece di far finta che siano numeri, perché la bugia costa cara — `"459.80"
 * + 0` in JavaScript fa `"459.800"`, e un totale sbagliato in una schermata
 * contabile non si riconosce a occhio. Si passa sempre da `importoNumerico()`.
 */

/** Un `Decimal` serializzato: stringa dalla rete, numero se già convertito. */
export type ImportoDaApi = string | number

/** `"459.80"` → `459.8`. Il posto unico dove la stringa diventa un numero. */
export function importoNumerico(valore: ImportoDaApi | null | undefined): number {
  if (valore === null || valore === undefined) return 0
  const numero = typeof valore === 'number' ? valore : Number(valore)
  return Number.isFinite(numero) ? numero : 0
}

export type StatoProposta = 'in_attesa' | 'approvata' | 'scartata' | 'superata'

/** I sei fattori del punteggio, come li persiste il motore. */
export interface FattoriProposta {
  importo: number
  riferimento: number
  controparte: number
  data: number
  codiceBanca: number
  unicita: number
}

/** Una frase di motivazione col suo segno: `-` è ciò che ha abbassato il punteggio. */
export interface MotivazioneProposta {
  testo: string
  segno: '+' | '-'
}

/** La riga bancaria a sinistra della scheda. */
export interface MovimentoDellaProposta {
  id: string
  transactionDate: string
  /** La causale grezza della banca, per intero: è l'unica fonte di controparte e riferimento. */
  description: string
  amount: ImportoDaApi
}

export interface FatturaDellaScadenza {
  id: string
  invoiceNumber: string | null
  supplierName: string | null
}

export interface ScadenzaDellaGamba {
  id: string
  descrizione: string
  dataScadenza: string
  numeroDocumento: string | null
  controparteNome: string | null
  importoTotale: ImportoDaApi
  importoPagato: ImportoDaApi
  invoice: FatturaDellaScadenza | null
}

/**
 * Una gamba della proposta: la quota imputata a una scadenza. Più gambe = un
 * pagamento cumulativo.
 */
export interface GambaProposta {
  id: string
  importo: ImportoDaApi
  /** Null sulle gambe che non puntano a una scadenza (il giroconto della R5). */
  schedule: ScadenzaDellaGamba | null
}

export interface PropostaDiRiconciliazione {
  id: string
  /** `R1`…`R8`, vedi `src/components/riconciliazione/regole.ts`. */
  regola: string
  punteggio: number
  fattori: FattoriProposta
  motivazioni: MotivazioneProposta[]
  stato: StatoProposta
  /** Null solo per le regole senza movimento a sinistra (R6). */
  bankTransaction: MovimentoDellaProposta | null
  gambe: GambaProposta[]
}

/**
 * I contatori del lotto, ricalcolati dalla rotta a ogni lettura.
 *
 * `alta + media + bassa` fa esattamente `inAttesa`: contano proposte, non
 * schede. È il difetto più visibile di CashKing, e la coda si fida di questa
 * identità invece di ricontare per conto proprio.
 */
export interface ContatoriLotto {
  totali: number
  inAttesa: number
  approvate: number
  scartate: number
  superate: number
  alta: number
  media: number
  bassa: number
}

export interface LottoDiProposte {
  id: string
  dateFrom: string
  dateTo: string
  regoleUsate: string[]
  sogliaMinima: number
  stato: string
  aiReferto: string | null
  aiRefertoAt: string | null
  createdAt: string
}

/**
 * Una riga dello storico, cioè quello che seleziona `GET
 * /api/riconciliazione-assistita/lotti`.
 *
 * Non è `LottoDiProposte` con qualche campo in meno: è un altro insieme. La
 * lista porta i contatori persistiti (`contaProposte` e compagnia) che il
 * dettaglio non manda — li ricalcola dalle proposte — e non porta
 * `regoleUsate`, `sogliaMinima` né `aiReferto`, che servono solo dentro un
 * lotto aperto. Tenerli separati evita di leggere campi che dalla lista non
 * arrivano mai e che a runtime sarebbero `undefined`.
 */
export interface LottoNelloStorico {
  id: string
  dateFrom: string
  dateTo: string
  stato: string
  contaProposte: number
  contaApprovate: number
  contaScartate: number
  contaSuperate: number
  aiRefertoAt: string | null
  createdAt: string
}

export interface RispostaLotto {
  lotto: LottoDiProposte
  proposte: PropostaDiRiconciliazione[]
  contatori: ContatoriLotto
}

/** La risposta del POST che genera il lotto. */
export interface EsitoGenerazioneLotto {
  batchId: string
  contaProposte: number
  perFascia: { alta: number; media: number; bassa: number }
}
