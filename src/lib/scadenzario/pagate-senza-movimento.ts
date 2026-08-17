import { Prisma } from '@prisma/client'

/**
 * Criterio Prisma per le scadenze con un pagamento registrato ma nessun
 * movimento di prima nota verificato collegato: il denaro risulta uscito
 * dallo scadenzario e non è mai entrato nel consuntivo.
 *
 * Include l'esclusione delle scadenze annullate. Senza, la cancellazione
 * logica di una scadenza già pagata a mano (`DELETE /api/scadenzario/[id]`
 * porta lo stato a 'annullata' ma NON azzera `importoPagato`) resterebbe
 * conteggiata da chi applica questo criterio senza combinarlo con la base
 * `where` della summary, che invece esclude sempre le annullate — due
 * frammenti testualmente identici applicati a basi diverse producevano
 * insiemi diversi fra il contatore e la lista filtrata. Estraendo qui il
 * criterio completo, resta un solo posto da cui può divergere.
 */
export function whereScadenzePagateSenzaMovimento(): Prisma.ScheduleWhereInput {
  return {
    stato: { not: 'annullata' },
    importoPagato: { gt: 0 },
    reconciliations: { none: { status: 'VERIFIED' } },
  }
}
