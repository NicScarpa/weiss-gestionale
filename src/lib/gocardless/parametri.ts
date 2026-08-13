/**
 * Parametri decisi al momento di chiedere un consenso alla banca — quanti
 * giorni di storico e di validità dell'accesso — e dove GoCardless deve
 * rimandare a fine autenticazione.
 *
 * Vivevano duplicati, identici, in `collegamenti/route.ts` e
 * `rinnovo/route.ts`: lo stesso precedente già stabilito per `scadenza.ts`
 * (due sottrazioni fra date scritte due volte tendono a divergere) vale
 * anche per questi due.
 */

/** Dove la banca rimanda a fine autenticazione. */
export function urlDiRitorno(): string {
  const esplicito = process.env.GOCARDLESS_REDIRECT_URI
  if (esplicito) return esplicito
  const base = process.env.APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  return `${base}/api/gocardless/callback`
}

/**
 * Un valore che l'istituto dichiara (spesso una stringa, in teoria un
 * numero) trasformato in intero, con un difetto se manca o non si legge.
 */
export function giorni(valore: unknown, difetto: number): number {
  const n = typeof valore === 'string' ? Number.parseInt(valore, 10) : typeof valore === 'number' ? valore : NaN
  return Number.isFinite(n) ? n : difetto
}
