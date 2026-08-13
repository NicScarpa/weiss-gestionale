/**
 * Quanti giorni mancano alla scadenza del consenso PSD2, e da quanti giorni
 * prima lo si segnala.
 *
 * Vive qui e non dentro un componente perché lo stesso calcolo serve in due
 * punti — il pannello delle impostazioni (`ConnessioniBancarie`) e il banner
 * della dashboard (`BannerConsenso`) — e due sottrazioni fra date scritte due
 * volte tendono a divergere.
 */

/** Quanti giorni prima della scadenza si comincia a segnalarla. */
export const PREAVVISO_GIORNI = 14

/**
 * Giorni alla scadenza, arrotondati per eccesso. Negativo se il consenso è
 * già scaduto: questa funzione non lo nasconde arrotondando a zero, sta a chi
 * chiama decidere come dirlo (l'errore da non fare è mostrare «fra -3
 * giorni»).
 */
export function giorniAllaScadenza(iso: string | null): number | null {
  if (!iso) return null
  const scadenza = new Date(iso)
  if (Number.isNaN(scadenza.getTime())) return null
  return Math.ceil((scadenza.getTime() - Date.now()) / 86_400_000)
}
