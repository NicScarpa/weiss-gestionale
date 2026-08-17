/**
 * Costanti sui tipi documento FatturaPA condivise fra codice server (import,
 * riconciliazione) e codice client (anteprima d'importazione, Task 6): per
 * questo vivono qui e non in `invoice-schedule-service.ts`, che importa
 * `@/lib/prisma` e romperebbe il bundle di chi le consuma dal browser — `dns`,
 * `fs`, `net`, `tls` non esistono lato client.
 */

/**
 * Sottoinsieme dei tipi documento che rettificano una fattura precedente e
 * RIDUCONO il dovuto: le note di credito (TD04, e la sua variante
 * semplificata TD08). TD05/TD09 sono note di DEBITO — aumentano il dovuto,
 * l'opposto.
 */
export const TIPI_DOCUMENTO_NOTA_CREDITO = new Set(['TD04', 'TD08'])
