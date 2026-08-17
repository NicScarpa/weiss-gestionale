/**
 * Il confronto fra il numero di distinta di un movimento e la causale della
 * banca.
 *
 * **Modulo foglia, senza un solo import.** Sta fuori da `matcher.ts` per due
 * ragioni. La prima: `matcher.ts` importa Prisma, e questa è una regola pura
 * che va poter provare senza database. La seconda: il punteggio complessivo è
 * materiale interno del matcher e non è esportato di proposito — riaprirlo per
 * far girare un test avrebbe rovesciato quella decisione, mentre la regola qui
 * sotto è esattamente ciò che il test deve difendere.
 */

/** Sotto i tre caratteri un riferimento comparirebbe in quasi ogni causale. */
const LUNGHEZZA_MINIMA = 3

/** Toglie tutto ciò che non è lettera o cifra: la banca e l'operatore separano diversamente. */
function normalizza(testo: string): string {
  return testo.toLowerCase().replace(/[^a-z0-9]/gi, '')
}

/**
 * Il numero di distinta compare nella causale bancaria?
 *
 * Entrambi i lati si normalizzano togliendo la punteggiatura: un `88-4213`
 * deve ritrovarsi anche se la causale scrive `884213`, e viceversa.
 */
export function numeroDistintaNellaCausale(
  documentRef: string | null | undefined,
  causale: string
): boolean {
  if (!documentRef) return false

  const numero = normalizza(documentRef)
  if (numero.length < LUNGHEZZA_MINIMA) return false

  return normalizza(causale).includes(numero)
}
