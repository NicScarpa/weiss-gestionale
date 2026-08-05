/**
 * Stima preventiva della data attesa di cassa.
 *
 * Il ritardo tipico di un fornitore è la mediana dei ritardi di pagamento
 * osservati (dataPagamento − dataScadenza) sulle sue scadenze passive pagate.
 * La mediana, non la media: la fattura contestata pagata a 90 giorni non deve
 * spostare la stima. Sotto le soglie (campione, giorni) la stima non si
 * applica: meglio la data contrattuale del rumore.
 *
 * Vedi docs/superpowers/specs/2026-08-05-stima-data-attesa-design.md.
 */

export const STIMA_MIN_CAMPIONE = 3
export const STIMA_SOGLIA_GIORNI = 2
export const STIMA_FINESTRA_GIORNI = 365

export function calcolaRitardoTipico(ritardiGiorni: number[]): number | null {
  if (ritardiGiorni.length < STIMA_MIN_CAMPIONE) return null

  const ordinati = [...ritardiGiorni].sort((a, b) => a - b)
  const mid = Math.floor(ordinati.length / 2)
  const mediana =
    ordinati.length % 2 === 0 ? (ordinati[mid - 1] + ordinati[mid]) / 2 : ordinati[mid]

  const giorni = Math.round(mediana)
  if (Math.abs(giorni) < STIMA_SOGLIA_GIORNI) return null
  return giorni
}
