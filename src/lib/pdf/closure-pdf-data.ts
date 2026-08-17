/**
 * Calcoli del PDF di chiusura cassa.
 *
 * Stanno qui, fuori dal template, perché il template è un albero di componenti
 * react-pdf che non si riesce a interrogare in un test: i numeri che finiscono
 * sul foglio vanno verificabili da soli.
 */

export interface UscitaPdf {
  /** Postazione che ha pagato. 'ESTERNO' = pagata fuori dalla cassa. */
  paidBy: string | null
  amount: number
}

export interface PostazionePdf {
  receiptAmount: number
  receiptVat: number
  invoiceAmount: number
  suspendedAmount: number
  cashAmount: number
  posAmount: number
  totalAmount: number
}

export interface TotaliPostazioni {
  receiptAmount: number
  receiptVat: number
  invoiceAmount: number
  suspendedAmount: number
  /** Contante incassato: quello rimasto in cassa più quello uscito per pagare le uscite. */
  cashAmount: number
  /** Quota di contante uscita dalla cassa, già compresa in cashAmount. */
  usciteDaCassa: number
  posAmount: number
  /** Sempre uguale a cashAmount + posAmount: la riga del totale deve quadrare a vista. */
  totalAmount: number
}

/**
 * Le uscite pagate dalla cassa sono contante che è entrato e poi uscito: per
 * risalire all'incasso vanno riaggiunte. Quelle pagate da fonte esterna non
 * hanno mai toccato la cassa e non c'entrano.
 */
export function totaleUsciteDaCassa(expenses: UscitaPdf[]): number {
  return expenses
    .filter((e) => e.paidBy !== 'ESTERNO')
    .reduce((somma, e) => somma + e.amount, 0)
}

export function calcolaTotaliPostazioni(
  stations: PostazionePdf[],
  expenses: UscitaPdf[]
): TotaliPostazioni {
  const somma = (prendi: (s: PostazionePdf) => number) =>
    stations.reduce((tot, s) => tot + prendi(s), 0)

  const usciteDaCassa = totaleUsciteDaCassa(expenses)
  const cashAmount = somma((s) => s.cashAmount) + usciteDaCassa
  const posAmount = somma((s) => s.posAmount)

  return {
    receiptAmount: somma((s) => s.receiptAmount),
    receiptVat: somma((s) => s.receiptVat),
    invoiceAmount: somma((s) => s.invoiceAmount),
    suspendedAmount: somma((s) => s.suspendedAmount),
    cashAmount,
    usciteDaCassa,
    posAmount,
    // Non si somma station.totalAmount: quello è al netto delle uscite e
    // lascerebbe la riga senza quadratura, che è il difetto da cui si parte.
    totalAmount: cashAmount + posAmount,
  }
}

export interface ParzialeScomposto {
  totale: number
  pos: number
  contanti: number
}

/**
 * Nel form il campo `receiptProgressive` è etichettato «Totale» e il POS ne è
 * la quota interna. Sommarli conterebbe il POS due volte.
 */
export function scomponiParziale(p: {
  receiptProgressive: number
  posProgressive: number
}): ParzialeScomposto {
  const totale = p.receiptProgressive
  const pos = p.posProgressive
  return {
    totale,
    pos,
    contanti: Math.max(0, totale - pos),
  }
}

/**
 * Quanti caffè sono stati fatti da un parziale all'altro. Il primo parziale si
 * misura sull'ultimo contatore letto nella chiusura precedente; se quella non
 * c'è, non c'è nemmeno il riferimento e la differenza resta vuota.
 */
export function calcolaDeltaCaffe(
  contatori: Array<number | null>,
  contatorePrecedente: number | null
): Array<number | null> {
  let ultimoLetto = contatorePrecedente
  return contatori.map((contatore) => {
    if (contatore === null || contatore === undefined) return null
    const delta = ultimoLetto === null || ultimoLetto === undefined
      ? null
      : contatore - ultimoLetto
    ultimoLetto = contatore
    return delta
  })
}

/** Il contatore dei caffè è un numero grande: senza separatore non si legge. */
export function formattaContatore(n: number): string {
  return new Intl.NumberFormat('it-IT', { useGrouping: true }).format(n)
}

/** Il segno serve: dice se il contatore è salito o è stato sostituito. */
export function formattaDeltaCaffe(delta: number): string {
  return `${delta >= 0 ? '+' : '-'}${formattaContatore(Math.abs(delta))}`
}

/**
 * Cosa scrivere nella colonna di destra dei dipendenti: le ore per chi era
 * presente, il codice per chi non c'era. Mai fra parentesi.
 */
export function valoreDipendente(a: {
  statusCode: string | null
  hours: number | null
}): string {
  if (a.hours !== null && a.hours !== undefined && a.hours > 0) {
    return `${String(a.hours).replace('.', ',')}h`
  }
  if (a.statusCode) return a.statusCode
  return '-'
}

export const WEATHER_EMOJI_PDF: Record<string, string> = {
  sunny: '☀️',       // sole
  cloudy: '☁️',      // nuvole
  rainy: '🌧️', // pioggia
  stormy: '⛈️',      // temporale
  snowy: '❄️',       // neve
  foggy: '🌫️', // nebbia
}

/**
 * Il meteo dell'intestazione usa le stesse emoji dei parziali: «sunny sunny
 * sunny» era il valore grezzo del database.
 */
export function meteoHeader(closure: {
  weatherMorning: string | null
  weatherAfternoon: string | null
  weatherEvening: string | null
}): string {
  const fasce: Array<[string, string | null]> = [
    ['Matt', closure.weatherMorning],
    ['Pom', closure.weatherAfternoon],
    ['Sera', closure.weatherEvening],
  ]

  const parti = fasce
    .filter(([, valore]) => Boolean(valore))
    .map(([etichetta, valore]) => `${etichetta} ${WEATHER_EMOJI_PDF[valore!] ?? valore}`)

  return parti.join('  ') || '-'
}
