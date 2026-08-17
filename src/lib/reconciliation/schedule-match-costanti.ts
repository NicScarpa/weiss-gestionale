/**
 * Pesi e soglie del matching fra movimenti di prima nota e scadenze.
 *
 * Nessun import qui: è la ragione d'essere del file. `schedule-matcher.ts`
 * importa `@/lib/prisma` per interrogare il database, e Prisma trascina `pg`
 * (quindi `dns`/`fs`/`net`/`tls`) — moduli Node che non esistono nel bundle
 * del browser. `schedule-reconciliation-panel.tsx` è `'use client'` e mostra
 * questi stessi valori accanto al badge di affinità: importarli dal modulo
 * con Prisma rompe la build di produzione (webpack non risolve `dns`/`fs`/
 * `net`/`tls` lato client). Queste due costanti stanno quindi in un modulo
 * separato che non importa nulla, e può essere caricato ovunque.
 */

/**
 * I pesi differiscono da quelli del matching bancario (`matcher.ts`, dove la
 * descrizione conta il 30%): sui dati reali di Sibill l'importo coincide al
 * centesimo in tutti i match automatici osservati, mentre la controparte
 * diverge in un caso su cinque — un bonifico intestato a "ESTENERGY" può
 * saldare una fattura "HERA". Qui l'importo pesa di più e la descrizione meno.
 */
export const SCHEDULE_MATCH_WEIGHTS = {
  AMOUNT: 0.55,
  DATE: 0.25,
  DESCRIPTION: 0.2,
  DOCUMENTO: 0.15,
} as const

export const SCHEDULE_MATCH_THRESHOLDS = {
  /** Sopra questa soglia il match è proposto come attendibile */
  SUGGESTED: 0.75,
  /** Sotto questa soglia il candidato non viene nemmeno mostrato */
  MINIMUM: 0.45,
} as const
