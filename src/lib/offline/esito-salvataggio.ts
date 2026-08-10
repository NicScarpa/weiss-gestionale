/**
 * L'esito di un salvataggio che può non arrivare al server, e il canale su cui
 * viene raccontato a chi sta usando l'applicazione.
 *
 * Senza rete «riuscito» e «fallito» non bastano: esiste un terzo esito — il
 * lavoro è al sicuro su questo dispositivo, il server non lo sa ancora — e
 * finché non è stato nominato, chi salvava una chiusura offline vedeva un
 * «Errore salvataggio bozza» accanto a un «le modifiche verranno sincronizzate»
 * che prometteva il contrario. Due messaggi opposti nello stesso momento, e
 * nessuno dei due vero.
 */
export type EsitoSalvataggio =
  | { esito: 'salvata'; closureId: string }
  | { esito: 'in-coda'; codaId: string }
  /** Il server ha già una chiusura per quella data: la navigazione è già stata fatta. */
  | { esito: 'conflitto'; closureId: string }

/**
 * Riporta a `undefined` il `void` di chi non ha un esito da raccontare — la
 * modifica di una chiusura già sul server, che una coda non ce l'ha. `void` in
 * TypeScript non si può interrogare; il valore, a tempo di esecuzione, è
 * `undefined` e basta.
 */
export function esitoOppureNiente(
  valore: EsitoSalvataggio | void
): EsitoSalvataggio | undefined {
  return (valore as EsitoSalvataggio | undefined) ?? undefined
}

/**
 * Sollevato quando manca la rete e non c'è una coda che possa raccogliere
 * l'operazione (una modifica a una chiusura già sul server, o una coda che non
 * si è potuta aprire). Esiste perché chi lo riceve possa dire la verità: senza
 * questa distinzione l'unico messaggio disponibile era «Errore salvataggio»,
 * che accanto a «verrà sincronizzata» diceva il contrario.
 *
 * Vive qui, e non accanto a chi lo solleva, perché a sollevarlo è un hook che
 * importa il form e a riceverlo è il form stesso: metterlo da una delle due
 * parti chiuderebbe un anello fra i due moduli.
 */
export class ErroreSenzaRete extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroreSenzaRete'
  }
}

/**
 * Identificativo sonner condiviso da tutti gli avvisi che parlano di rete e di
 * coda: «sei offline», «l'ho messa in coda», «l'ho inviata», «non sono
 * riuscito a inviarla». Avendo lo stesso id si sostituiscono invece di
 * impilarsi, ed è il motivo per cui esiste: sono un racconto solo, e due
 * frasi di quel racconto visibili insieme si contraddicono sempre.
 */
export const AVVISO_OFFLINE = 'stato-offline'
