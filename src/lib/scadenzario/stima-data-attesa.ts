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

import { prisma } from '@/lib/prisma'
import { differenceInCalendarDays, subDays } from 'date-fns'

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

export async function stimaRitardoFornitore(
  supplierId: string,
  venueId: string
): Promise<number | null> {
  const pagate = await prisma.schedule.findMany({
    where: {
      venueId,
      supplierId,
      tipo: 'passiva',
      stato: 'pagata',
      dataPagamento: { not: null, gte: subDays(new Date(), STIMA_FINESTRA_GIORNI) },
    },
    select: { dataScadenza: true, dataPagamento: true },
  })

  const ritardi = pagate
    .filter((s): s is typeof s & { dataPagamento: Date } => s.dataPagamento !== null)
    .map((s) => differenceInCalendarDays(s.dataPagamento, s.dataScadenza))

  return calcolaRitardoTipico(ritardi)
}
