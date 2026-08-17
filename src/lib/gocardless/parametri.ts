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
import { ConfigurazioneMancante } from './errori'

/**
 * Dove la banca rimanda a fine autenticazione.
 *
 * Ordine: l'indirizzo esplicito, poi `APP_URL`, poi `NEXTAUTH_URL`.
 * `NEXTAUTH_URL` è nella catena perché è l'indirizzo pubblico che
 * un'installazione ha *sempre* — senza, il login non funzionerebbe — mentre
 * `APP_URL` è servita finora solo a questa funzione, e infatti in produzione
 * mancava.
 *
 * **Il fallback a `localhost` non vale in produzione.** GoCardless accetta
 * qualunque redirect senza whitelist, quindi un indirizzo sbagliato non
 * produce nessun errore: la requisition nasce, l'utente si autentica in
 * banca, approva l'OTP, e alla fine il browser atterra su una porta che su
 * quella macchina non esiste. Il consenso è valido ma sembra perso, e il
 * difetto si manifesta a valle di tutto, dove nessuno lo collega a una
 * variabile d'ambiente. Meglio non far partire il collegamento: un 503
 * «non è configurato» si legge, un redirect a localhost no.
 *
 * `ambiente` è un parametro solo per poter provare i due rami senza mutare
 * `process.env.NODE_ENV`, che sotto Next è di sola lettura.
 */
export function urlDiRitorno(ambiente: string | undefined = process.env.NODE_ENV): string {
  const esplicito = process.env.GOCARDLESS_REDIRECT_URI
  if (esplicito) return esplicito

  const base = (process.env.APP_URL ?? process.env.NEXTAUTH_URL)?.replace(/\/$/, '')
  if (base) return `${base}/api/gocardless/callback`

  if (ambiente === 'production') {
    throw new ConfigurazioneMancante(
      'Manca l indirizzo pubblico dell applicazione: impostare APP_URL (o GOCARDLESS_REDIRECT_URI) ' +
        'prima di collegare una banca, altrimenti la banca rimanda l utente su localhost a fine autenticazione'
    )
  }

  return 'http://localhost:3000/api/gocardless/callback'
}

/**
 * Un valore che l'istituto dichiara (spesso una stringa, in teoria un
 * numero) trasformato in intero, con un difetto se manca o non si legge.
 */
export function giorni(valore: unknown, difetto: number): number {
  const n = typeof valore === 'string' ? Number.parseInt(valore, 10) : typeof valore === 'number' ? valore : NaN
  return Number.isFinite(n) ? n : difetto
}
