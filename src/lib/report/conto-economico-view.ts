/**
 * Funzioni pure di supporto alla pagina del conto economico per centro
 * (Task 22). L'aggregazione vera resta tutta in `conto-economico.ts`
 * (Task 20, non toccato qui): questo modulo fa solo le trasformazioni che
 * servono alla vista — quali colonne mostrare, i sottototali dei rami
 * mastro/gruppo dell'albero, il segno del netto "senza conto" per
 * l'incolonnamento, e le righe del CSV — lavorando sugli euro già
 * arrotondati che l'API restituisce, non sui centesimi interi
 * dell'aggregatore.
 */

import { UNASSIGNED, type RigaContoEconomico, type TotaliContoEconomico } from './conto-economico'

export const NON_ATTRIBUITO_LABEL = 'Non attribuito'

export interface ColonnaReport {
  key: string
  label: string
}

/**
 * Le colonne da mostrare in tabella: un centro di costo per ognuno di quelli
 * attivi, nell'ordine ricevuto dall'API; poi gli eventuali centri che
 * l'aggregatore ha aperto ma che non sono fra quelli attivi noti (un centro
 * storico disattivato dopo il movimento, per esempio: l'aggregatore non lo
 * perde, e nemmeno la vista deve — "niente sparisce" è la stessa regola di
 * `aggregaContoEconomico`, applicata qui alle colonne); infine `UNASSIGNED`
 * ("Non attribuito") solo se compare da qualche parte con un valore diverso
 * da zero. Un centro attivo compare sempre, anche se a zero nel periodo: è
 * l'elenco delle attività dell'azienda, non un derivato dei movimenti.
 */
export function determinaColonne(
  costCenters: Array<{ code: string; name: string }>,
  rows: RigaContoEconomico[],
  senzaContoNetto: Record<string, number>
): ColonnaReport[] {
  const codiciNoti = new Set(costCenters.map((c) => c.code))
  const colonne: ColonnaReport[] = costCenters.map((c) => ({ key: c.code, label: c.name }))

  // `senzaContoNetto` è costruito dall'aggregatore su tutte le colonne che
  // conosce, sempre, anche a zero: le sue chiavi bastano a ritrovare un
  // centro sconosciuto. L'unione con le chiavi delle righe è solo una
  // difesa in più, nel caso quell'invariante cambiasse.
  const colonneNoteAllAggregatore = new Set(Object.keys(senzaContoNetto))
  for (const riga of rows) {
    for (const key of Object.keys(riga.amounts)) colonneNoteAllAggregatore.add(key)
  }

  for (const key of colonneNoteAllAggregatore) {
    if (key === UNASSIGNED || codiciNoti.has(key)) continue
    colonne.push({ key, label: key })
  }

  const nonAttribuitoHaValori =
    (senzaContoNetto[UNASSIGNED] ?? 0) !== 0 || rows.some((r) => (r.amounts[UNASSIGNED] ?? 0) !== 0)

  if (nonAttribuitoHaValori) {
    colonne.push({ key: UNASSIGNED, label: NON_ATTRIBUITO_LABEL })
  }

  return colonne
}

/**
 * Somma un gruppo di righe colonna per colonna: il sottototale che un ramo
 * mastro o gruppo dell'albero mostra sulla propria intestazione, sia
 * compresso che espanso.
 *
 * È un rollup di sola vista sopra numeri già arrotondati al centesimo
 * dall'API: l'errore di virgola mobile su poche decine di addendi resta ben
 * sotto il mezzo centesimo, quindi qui non serve la disciplina dei centesimi
 * interi che `aggregaContoEconomico` applica al totale generale del report.
 */
export function sommaRighe(
  rows: readonly RigaContoEconomico[],
  colonne: readonly ColonnaReport[]
): { amounts: Record<string, number>; total: number } {
  const amounts: Record<string, number> = {}
  for (const colonna of colonne) {
    amounts[colonna.key] = rows.reduce((somma, riga) => somma + (riga.amounts[colonna.key] ?? 0), 0)
  }
  const total = rows.reduce((somma, riga) => somma + riga.total, 0)
  return { amounts, total }
}

/**
 * Il netto "senza conto" con la convenzione di segno delle righe economiche.
 *
 * `senzaContoNetto` dell'aggregatore è avere − dare (positivo = incasso):
 * nelle righe del report, invece, un costo è positivo. Mostrare l'uno sotto
 * le altre senza cambiare segno farebbe leggere un pagamento senza conto come
 * un numero negativo in una colonna dove i costi sono positivi — da qui
 * l'inversione.
 */
export function senzaContoPerRiga(senzaContoNetto: Record<string, number>): Record<string, number> {
  const invertito: Record<string, number> = {}
  for (const [colonna, valore] of Object.entries(senzaContoNetto)) {
    invertito[colonna] = -valore
  }
  return invertito
}

/** Se c'è almeno un valore diverso da zero, la riga "senza conto" va mostrata. */
export function haSenzaConto(senzaContoNetto: Record<string, number>): boolean {
  return Object.values(senzaContoNetto).some((valore) => valore !== 0)
}

/** Un numero come stringa CSV: due decimali fissi, punto come separatore (coerente con AnalisiCostiClient). */
function formatoCsv(valore: number): string {
  return valore.toFixed(2)
}

export interface DatiCsvContoEconomico {
  colonne: ColonnaReport[]
  ricavi: RigaContoEconomico[]
  costi: RigaContoEconomico[]
  totalsPerColonna: Record<string, TotaliContoEconomico>
  totals: TotaliContoEconomico
  /** Già con la convenzione di segno delle righe: passare l'output di `senzaContoPerRiga`. */
  senzaContoRiga: Record<string, number>
}

/**
 * La matrice di righe del CSV esportato, in ordine: intestazione, sezione
 * RICAVI con il proprio totale, sezione COSTI con il proprio totale, la riga
 * "senza conto" se presente, e infine il MARGINE. Righe vuote separano le
 * sezioni, come nel CSV di AnalisiCostiClient.
 */
export function buildCsvMatrix(dati: DatiCsvContoEconomico): string[][] {
  const { colonne, ricavi, costi, totalsPerColonna, totals, senzaContoRiga } = dati

  const header = ['Codice', 'Voce', ...colonne.map((c) => c.label), 'Totale']

  const rigaVoce = (riga: RigaContoEconomico): string[] => [
    riga.code,
    riga.name,
    ...colonne.map((c) => formatoCsv(riga.amounts[c.key] ?? 0)),
    formatoCsv(riga.total),
  ]

  const rigaTotale = (label: string, perColonna: (colonna: string) => number, totale: number): string[] => [
    '',
    label,
    ...colonne.map((c) => formatoCsv(perColonna(c.key))),
    formatoCsv(totale),
  ]

  const righe: string[][] = [header]

  righe.push(['RICAVI'])
  righe.push(...ricavi.map(rigaVoce))
  righe.push(rigaTotale('Totale Ricavi', (c) => totalsPerColonna[c]?.ricavi ?? 0, totals.ricavi))

  righe.push([])
  righe.push(['COSTI'])
  righe.push(...costi.map(rigaVoce))
  righe.push(rigaTotale('Totale Costi', (c) => totalsPerColonna[c]?.costi ?? 0, totals.costi))

  if (haSenzaConto(senzaContoRiga)) {
    const totaleSenzaConto = Object.values(senzaContoRiga).reduce((somma, v) => somma + v, 0)
    righe.push([])
    righe.push(rigaTotale('Movimenti senza conto (netto)', (c) => senzaContoRiga[c] ?? 0, totaleSenzaConto))
  }

  righe.push([])
  righe.push(rigaTotale('MARGINE', (c) => totalsPerColonna[c]?.margine ?? 0, totals.margine))

  return righe
}
