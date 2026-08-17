/**
 * Soglie pure della stima del ritardo di pagamento fornitore.
 *
 * Nessun import qui: è la ragione d'essere del file. `stima-data-attesa.ts`
 * importa `@/lib/prisma` per interrogare il database, quindi non è sicuro da
 * caricare in un componente client (trascinerebbe il client Prisma nel
 * bundle del browser). Queste tre costanti servono anche lì — la scheda
 * fornitore mostra il giudizio «In anticipo / In linea / In ritardo» con la
 * stessa soglia usata dal previsionale — quindi stanno in un modulo separato
 * che non importa nulla, e può essere caricato ovunque senza conseguenze.
 */

/** Sotto questo numero di pagamenti osservati il campione non basta per dire
 *  alcunché: né una mediana né un giudizio. */
export const STIMA_MIN_CAMPIONE = 3

/** Sotto questo scarto (in giorni, in valore assoluto) rispetto alla
 *  scadenza, il ritardo/anticipo è rumore: il previsionale non corregge la
 *  data, la scheda fornitore mostra «In linea» invece di un segno. */
export const STIMA_SOGLIA_GIORNI = 2

/** Finestra temporale (in giorni) entro cui guardare le scadenze pagate per
 *  calcolare la mediana: storie più vecchie non contano più. */
export const STIMA_FINESTRA_GIORNI = 365
