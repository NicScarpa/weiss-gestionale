/**
 * Costruisce il client GoCardless per il codice applicativo.
 *
 * È l'unico punto fuori dagli script che legge `GOCARDLESS_SECRET_ID` e
 * `GOCARDLESS_SECRET_KEY`: tenerne uno solo significa che per sapere dove
 * finiscono i segreti basta leggere questo file.
 *
 * `impostaClientPerTest` esiste perché i test non devono toccare la rete: il
 * limite della banca è di 4 chiamate al giorno per conto e per endpoint, e una
 * chiamata sprecata costa un giorno.
 */
import { creaClient, type ClientGoCardless } from './client'

let perTest: ClientGoCardless | null = null

/** Sostituisce il client con uno finto. `null` ripristina quello vero. */
export function impostaClientPerTest(finto: ClientGoCardless | null): void {
  perTest = finto
}

export function clientDaAmbiente(): ClientGoCardless {
  if (perTest) return perTest

  const secretId = process.env.GOCARDLESS_SECRET_ID
  const secretKey = process.env.GOCARDLESS_SECRET_KEY
  if (!secretId || !secretKey) {
    throw new Error(
      'GOCARDLESS_SECRET_ID e GOCARDLESS_SECRET_KEY non sono impostate: il collegamento alla banca non è configurato.'
    )
  }

  return creaClient({ secretId, secretKey })
}
