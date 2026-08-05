import { toRomeParts, toDateOnlyUtc } from './timezone'

/**
 * Quando un promemoria di timbratura deve partire.
 *
 * La decisione sta qui, fuori dalla route del cron, perché è tutta questione
 * di giorni e minuti italiani su un server che gira in UTC: è la parte che
 * vale la pena provare senza database.
 */

/**
 * Ritardo oltre il quale il promemoria non parte più.
 *
 * Il cron gira ogni quarto d'ora, quindi in condizioni normali il ritardo è di
 * pochi minuti. Se invece resta fermo mezza giornata, un "ricordati di timbrare
 * l'entrata" che arriva alle 23:00 non è un promemoria: è rumore che insegna a
 * ignorare le notifiche. Passata la finestra la giornata si chiude comunque,
 * così il cron non lo rivaluta ogni quarto d'ora fino a mezzanotte.
 */
export const RITARDO_MASSIMO_MINUTI = 120

/** I soli campi del promemoria che decidono se è ora di inviarlo. */
export interface PromemoriaProgrammato {
  /** Orario dell'avviso, in minuti dalla mezzanotte italiana. */
  timeMinutes: number
  /** Giorni attivi: 0 = domenica. */
  daysOfWeek: number[]
  /** Ultima giornata italiana in cui è partito (colonna `@db.Date`). */
  lastSentDate: Date | null
}

export type EsitoPromemoria =
  | 'DA_INVIARE'
  | 'GIORNO_ESCLUSO'
  | 'GIA_INVIATO'
  | 'NON_ANCORA'
  | 'TROPPO_TARDI'

/**
 * L'esito è più di un booleano perché `TROPPO_TARDI` non si comporta come gli
 * altri scarti: la giornata va segnata lo stesso, altrimenti il promemoria
 * resta "in scadenza" fino a mezzanotte.
 */
export function valutaPromemoria(
  promemoria: PromemoriaProgrammato,
  adesso: Date
): EsitoPromemoria {
  const { dateKey, minutesFromMidnight, weekday } = toRomeParts(adesso)

  if (!promemoria.daysOfWeek.includes(weekday)) return 'GIORNO_ESCLUSO'

  // `lastSentDate` è una colonna @db.Date: Prisma la restituisce come
  // mezzanotte UTC del giorno, che è esattamente ciò che produce toDateOnlyUtc.
  const oggi = toDateOnlyUtc(dateKey)
  if (
    promemoria.lastSentDate !== null &&
    promemoria.lastSentDate.getTime() >= oggi.getTime()
  ) {
    return 'GIA_INVIATO'
  }

  const ritardo = minutesFromMidnight - promemoria.timeMinutes
  if (ritardo < 0) return 'NON_ANCORA'
  if (ritardo > RITARDO_MASSIMO_MINUTI) return 'TROPPO_TARDI'

  return 'DA_INVIARE'
}
