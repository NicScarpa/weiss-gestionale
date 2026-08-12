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
import { addDays, differenceInCalendarDays, subDays } from 'date-fns'
import { logger } from '@/lib/logger'

export const STIMA_MIN_CAMPIONE = 3
export const STIMA_SOGLIA_GIORNI = 2
export const STIMA_FINESTRA_GIORNI = 365

/**
 * La mediana dei ritardi osservati, arrotondata. `null` solo quando il campione
 * è troppo piccolo per dire alcunché.
 *
 * Sta separata da `calcolaRitardoTipico` perché le due domande sono diverse: il
 * previsionale vuole sapere se correggere la data (e non corregge né senza dati
 * né per uno scarto di un giorno), la scheda fornitore vuole sapere *come paga
 * questo fornitore* — e «puntuale» è una risposta, mentre «non lo so» è
 * un'altra. Fuse in un unico `null`, erano indistinguibili.
 */
export function medianaRitardi(ritardiGiorni: number[]): number | null {
  if (ritardiGiorni.length < STIMA_MIN_CAMPIONE) return null

  const ordinati = [...ritardiGiorni].sort((a, b) => a - b)
  const mid = Math.floor(ordinati.length / 2)
  const mediana =
    ordinati.length % 2 === 0 ? (ordinati[mid - 1] + ordinati[mid]) / 2 : ordinati[mid]

  return Math.round(mediana)
}

export function calcolaRitardoTipico(ritardiGiorni: number[]): number | null {
  const giorni = medianaRitardi(ritardiGiorni)
  if (giorni === null) return null
  // Sotto la soglia la correzione non si applica: meglio la data contrattuale
  // del rumore.
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

/**
 * Ritardo tipico e numerosità del campione per più fornitori in una sola
 * interrogazione. La lista fornitori li vuole tutti insieme: una query per
 * fornitore sarebbe un N+1 su una pagina che si apre di frequente.
 *
 * I fornitori senza scadenze pagate nella finestra non compaiono nella mappa —
 * chi legge tratta l'assenza come campione zero.
 */
export async function ritardiPerFornitore(
  venueId: string,
  supplierIds: string[]
): Promise<Map<string, { mediana: number | null; campione: number }>> {
  if (supplierIds.length === 0) return new Map()

  const pagate = await prisma.schedule.findMany({
    where: {
      venueId,
      supplierId: { in: supplierIds },
      tipo: 'passiva',
      stato: 'pagata',
      dataPagamento: { not: null, gte: subDays(new Date(), STIMA_FINESTRA_GIORNI) },
    },
    select: { supplierId: true, dataScadenza: true, dataPagamento: true },
  })

  const perFornitore = new Map<string, number[]>()
  for (const s of pagate) {
    if (!s.supplierId || s.dataPagamento === null) continue
    const ritardo = differenceInCalendarDays(s.dataPagamento, s.dataScadenza)
    const elenco = perFornitore.get(s.supplierId)
    if (elenco) elenco.push(ritardo)
    else perFornitore.set(s.supplierId, [ritardo])
  }

  const esito = new Map<string, { mediana: number | null; campione: number }>()
  for (const [supplierId, ritardi] of perFornitore) {
    esito.set(supplierId, { mediana: medianaRitardi(ritardi), campione: ritardi.length })
  }
  return esito
}

const STATI_APERTI = ['aperta', 'parzialmente_pagata', 'scaduta']

interface ScadenzaDaStimare {
  id: string
  dataScadenza: Date
  dataAttesaSource: string | null
}

/** Scrive (o azzera) la stima su una scadenza. Non controlla la source: i
 *  chiamanti filtrano prima. */
async function scriviStima(scadenza: ScadenzaDaStimare, ritardo: number | null): Promise<void> {
  if (ritardo === null) {
    // La storia non basta più: una stima precedente torna a null
    // (null = coincide con la contrattuale); il resto non si tocca
    if (scadenza.dataAttesaSource === 'stima') {
      await prisma.schedule.update({
        where: { id: scadenza.id },
        data: { dataAttesa: null, dataAttesaSource: null },
      })
    }
    return
  }
  await prisma.schedule.update({
    where: { id: scadenza.id },
    data: { dataAttesa: addDays(scadenza.dataScadenza, ritardo), dataAttesaSource: 'stima' },
  })
}

export async function applicaStimaSuScadenza(scheduleId: string, venueId: string): Promise<void> {
  try {
    const scadenza = await prisma.schedule.findFirst({
      where: { id: scheduleId, venueId },
      select: {
        id: true,
        tipo: true,
        stato: true,
        supplierId: true,
        dataScadenza: true,
        dataAttesaSource: true,
      },
    })
    if (!scadenza) return
    if (scadenza.tipo !== 'passiva' || !scadenza.supplierId) return
    if (!STATI_APERTI.includes(scadenza.stato)) return
    if (scadenza.dataAttesaSource !== null && scadenza.dataAttesaSource !== 'stima') return

    const ritardo = await stimaRitardoFornitore(scadenza.supplierId, venueId)
    await scriviStima(scadenza, ritardo)
  } catch (error) {
    logger.error('Stima data attesa non applicata', error, { scheduleId })
  }
}

export async function ricalcolaStimeFornitore(supplierId: string, venueId: string): Promise<void> {
  try {
    const ritardo = await stimaRitardoFornitore(supplierId, venueId)
    const aperte = await prisma.schedule.findMany({
      where: {
        venueId,
        supplierId,
        tipo: 'passiva',
        stato: { in: STATI_APERTI },
        OR: [{ dataAttesaSource: null }, { dataAttesaSource: 'stima' }],
      },
      select: { id: true, dataScadenza: true, dataAttesaSource: true },
    })
    for (const scadenza of aperte) {
      await scriviStima(scadenza, ritardo)
    }
  } catch (error) {
    logger.error('Ricalcolo stime fornitore fallito', error, { supplierId })
  }
}
