/**
 * Da quale giorno chiedere i movimenti a GoCardless.
 *
 * Puro di proposito: niente database, niente rete, e nessuna data corrente
 * implicita — `oggi` entra come parametro, così il comportamento a cavallo di
 * mezzanotte è verificabile invece che sperato.
 */

/**
 * Il massimo che la banca concede al primo collegamento.
 *
 * Novanta giorni, non i 24 mesi ipotizzati prima della sonda: lo storico
 * anteriore non si recupera da GoCardless in nessun modo, e per quello resta
 * l'import CSV dal portale della banca.
 */
export const GIORNI_MASSIMI_STORICO = 90

export interface StatoConto {
  /** Scelta dell'admin al collegamento: non chiedere nulla di più vecchio. */
  syncCutoffDate: Date | null
  /** Data del movimento più recente già salvato per questo conto. */
  ultimoMovimento: Date | null
}

/** `Date` → `YYYY-MM-DD`, sempre in UTC. */
function giorno(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Le tre regole, in ordine:
 *
 * 1. dall'**ultimo movimento noto**, incluso — la banca può rettificare una
 *    giornata già consegnata, e ripartire dal giorno dopo perderebbe le
 *    rettifiche senza dirlo. Ciò che rientra identico lo scarta l'indice unico.
 * 2. la **data di taglio** è un pavimento: impedisce di risalire più indietro,
 *    non obbliga a ripartire da lì. Serve a non duplicare uno storico CSV.
 * 3. mai oltre **90 giorni**: la banca non risponde comunque, e chiedere di più
 *    spreca una chiamata del contingente invece di allargare il risultato.
 *
 * Tutte le date si trattano in UTC. La colonna è `@db.Date`, senza fuso:
 * costruire con il costruttore locale sposterebbe di un giorno chi sta a est di
 * Greenwich — noi, da fine marzo a fine ottobre.
 */
export function calcolaDataDa(stato: StatoConto, oggi: Date): string {
  const limite = new Date(oggi)
  limite.setUTCDate(limite.getUTCDate() - GIORNI_MASSIMI_STORICO)

  const candidati = [stato.syncCutoffDate, stato.ultimoMovimento].filter(
    (d): d is Date => d !== null
  )

  const scelto =
    candidati.length > 0
      ? new Date(Math.max(...candidati.map((d) => d.getTime())))
      : limite

  return giorno(scelto.getTime() < limite.getTime() ? limite : scelto)
}
