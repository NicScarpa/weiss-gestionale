/**
 * La scala del punteggio: i pesi dei fattori, le soglie delle fasce e la
 * funzione che classifica.
 *
 * **Modulo foglia, senza un solo import — e deve restarlo.** Queste tre cose
 * servono anche alla schermata (`src/components/riconciliazione/`), e la
 * schermata non può importarle da `punteggio.ts`: quel modulo prende
 * `stringSimilarity` e `daysDifference` da `matcher.ts`, che importa Prisma.
 * Un componente `'use client'` che risalisse quella catena si tirerebbe dentro
 * il client Prisma nel bundle del browser — un guasto che nessun test unitario
 * vede, perché compare solo in `next build`.
 *
 * `punteggio.ts` le ri-esporta, così chi già le importava da lì non cambia
 * nulla.
 */

export const PESI = {
  IMPORTO: 30,
  RIFERIMENTO: 20,
  CONTROPARTE: 20,
  DATA: 15,
  CODICE_BANCA: 10,
  UNICITA: 5,
  /** Il bonus quando esiste esattamente un'altra alternativa plausibile. */
  UNICITA_PARZIALE: 2,
} as const

/**
 * Le soglie delle fasce.
 *
 * ALTA è una stima da rivedere dopo la prima misurazione sui movimenti veri:
 * è la fascia che si approva in blocco senza aprire le schede, quindi un falso
 * positivo lì è un errore contabile che nessuno vede passare. Sta qui, in un
 * posto solo, proprio perché va cambiata guardando un numero.
 */
export const SOGLIE = {
  ALTA: 85,
  MEDIA: 60,
  MINIMA: 40,
} as const

export type Fascia = 'alta' | 'media' | 'bassa'

export function fascia(punteggio: number): Fascia {
  if (punteggio >= SOGLIE.ALTA) return 'alta'
  if (punteggio >= SOGLIE.MEDIA) return 'media'
  return 'bassa'
}
