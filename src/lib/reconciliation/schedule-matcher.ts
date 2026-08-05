import { prisma } from '@/lib/prisma'
import { stringSimilarity, daysDifference } from './matcher'

/**
 * Matching fra movimenti di prima nota e scadenze.
 *
 * È il ponte che mancava: la scadenza dice cosa va pagato, il movimento porta
 * l'imputazione contabile. Riconciliarli chiude il ciclo.
 *
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
} as const

export const SCHEDULE_MATCH_THRESHOLDS = {
  /** Sopra questa soglia il match è proposto come attendibile */
  SUGGESTED: 0.75,
  /** Sotto questa soglia il candidato non viene nemmeno mostrato */
  MINIMUM: 0.45,
} as const

/** Movimento di prima nota, lato "denaro che si è mosso". */
export interface MatchableEntry {
  id: string
  date: Date
  description: string
  debitAmount: number | null
  creditAmount: number | null
  documentRef: string | null
  counterpartName: string | null
}

/** Scadenza, lato "denaro che deve muoversi". */
export interface MatchableSchedule {
  id: string
  tipo: string
  dataScadenza: Date
  descrizione: string
  importoTotale: number
  importoPagato: number
  numeroDocumento: string | null
  controparteNome: string | null
}

export interface ScheduleMatchCandidate {
  scheduleId: string
  confidence: number
  /** Quanto resta da saldare sulla scadenza */
  residuo: number
  descrizione: string
  dataScadenza: Date
}

/** Importo del movimento nel verso che interessa la scadenza. */
function importoMovimento(entry: MatchableEntry, tipo: string): number {
  // Una scadenza passiva si salda con un'uscita, una attiva con un'entrata
  const uscita = Number(entry.creditAmount) || 0
  const entrata = Number(entry.debitAmount) || 0
  return tipo === 'attiva' ? entrata : uscita
}

/**
 * Punteggio di affinità fra un movimento e una scadenza, da 0 a 1.
 * Funzione pura: nessun accesso al database.
 */
export function calculateScheduleMatchScore(
  entry: MatchableEntry,
  schedule: MatchableSchedule
): number {
  const importoEntry = importoMovimento(entry, schedule.tipo)

  // Un movimento nel verso sbagliato non salda la scadenza
  if (importoEntry <= 0) return 0

  const residuo = schedule.importoTotale - schedule.importoPagato
  if (residuo <= 0) return 0

  let score = 0

  // Importo: l'indizio più forte
  const diff = Math.abs(importoEntry - residuo)
  if (diff < 0.01) {
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT
  } else if (diff <= 1) {
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT * 0.9
  } else if (importoEntry < residuo) {
    // Acconto: plausibile ma meno certo, tanto meno quanto più è piccolo
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT * 0.5 * (importoEntry / residuo)
  } else {
    // Il movimento eccede la scadenza: può coprirne altre, ma qui è debole
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT * 0.2
  }

  // Data: i pagamenti arrivano spesso in ritardo, la finestra è ampia e
  // asimmetrica — pagare in anticipo è più raro che pagare tardi
  const giorni = daysDifference(entry.date, schedule.dataScadenza)
  if (giorni === 0) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE
  } else if (giorni <= 3) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.9
  } else if (giorni <= 10) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.7
  } else if (giorni <= 30) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.4
  } else if (giorni <= 60) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.15
  }

  // Descrizione e controparte: rafforzativi, mai determinanti
  const testoScadenza = [schedule.descrizione, schedule.controparteNome]
    .filter(Boolean)
    .join(' ')
  const testoMovimento = [entry.description, entry.counterpartName]
    .filter(Boolean)
    .join(' ')
  score += SCHEDULE_MATCH_WEIGHTS.DESCRIPTION * stringSimilarity(testoMovimento, testoScadenza)

  // Il numero documento nella causale è quasi una firma
  if (schedule.numeroDocumento) {
    const numero = schedule.numeroDocumento.toLowerCase().replace(/[^a-z0-9]/gi, '')
    const causale = entry.description.toLowerCase().replace(/[^a-z0-9]/gi, '')
    if (numero.length >= 3 && causale.includes(numero)) {
      score = Math.min(1, score + 0.15)
    }
  }

  return Math.round(score * 100) / 100
}

/**
 * Scadenze che potrebbero corrispondere a un movimento, dalla più probabile.
 * Le proposte non vengono persistite: si ricalcolano a ogni richiesta, come
 * fa Sibill.
 */
export async function findScheduleCandidates(
  entryId: string,
  venueId: string,
  limit = 5
): Promise<ScheduleMatchCandidate[]> {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: entryId, venueId },
    select: {
      id: true,
      date: true,
      description: true,
      debitAmount: true,
      creditAmount: true,
      documentRef: true,
      counterpartName: true,
    },
  })

  if (!entry) return []

  // Finestra ampia: un pagamento può arrivare con mesi di ritardo
  const da = new Date(entry.date)
  da.setDate(da.getDate() - 90)
  const a = new Date(entry.date)
  a.setDate(a.getDate() + 30)

  const schedules = await prisma.schedule.findMany({
    where: {
      venueId,
      stato: { in: ['aperta', 'parzialmente_pagata', 'scaduta'] },
      dataScadenza: { gte: da, lte: a },
    },
    select: {
      id: true,
      tipo: true,
      dataScadenza: true,
      descrizione: true,
      importoTotale: true,
      importoPagato: true,
      numeroDocumento: true,
      controparteNome: true,
    },
  })

  const matchable: MatchableEntry = {
    ...entry,
    debitAmount: entry.debitAmount ? Number(entry.debitAmount) : null,
    creditAmount: entry.creditAmount ? Number(entry.creditAmount) : null,
  }

  return schedules
    .map((s) => {
      const schedule: MatchableSchedule = {
        ...s,
        importoTotale: Number(s.importoTotale),
        importoPagato: Number(s.importoPagato),
      }
      return {
        scheduleId: s.id,
        confidence: calculateScheduleMatchScore(matchable, schedule),
        residuo: schedule.importoTotale - schedule.importoPagato,
        descrizione: s.descrizione,
        dataScadenza: s.dataScadenza,
      }
    })
    .filter((c) => c.confidence >= SCHEDULE_MATCH_THRESHOLDS.MINIMUM)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}

/**
 * Movimenti che potrebbero saldare una scadenza. È la vista speculare della
 * precedente: Sibill espone entrambe le direzioni.
 */
export async function findEntryCandidates(
  scheduleId: string,
  venueId: string,
  limit = 5
): Promise<Array<{ journalEntryId: string; confidence: number; description: string; date: Date; amount: number }>> {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, venueId },
    select: {
      id: true,
      tipo: true,
      dataScadenza: true,
      descrizione: true,
      importoTotale: true,
      importoPagato: true,
      numeroDocumento: true,
      controparteNome: true,
    },
  })

  if (!schedule) return []

  const da = new Date(schedule.dataScadenza)
  da.setDate(da.getDate() - 30)
  const a = new Date(schedule.dataScadenza)
  a.setDate(a.getDate() + 90)

  // Esclude i movimenti già riconciliati con questa scadenza
  const entries = await prisma.journalEntry.findMany({
    where: {
      venueId,
      date: { gte: da, lte: a },
      hiddenAt: null,
      scheduleReconciliations: {
        none: { scheduleId, status: 'VERIFIED' },
      },
    },
    select: {
      id: true,
      date: true,
      description: true,
      debitAmount: true,
      creditAmount: true,
      documentRef: true,
      counterpartName: true,
    },
    take: 200,
  })

  const matchableSchedule: MatchableSchedule = {
    ...schedule,
    importoTotale: Number(schedule.importoTotale),
    importoPagato: Number(schedule.importoPagato),
  }

  return entries
    .map((e) => {
      const entry: MatchableEntry = {
        ...e,
        debitAmount: e.debitAmount ? Number(e.debitAmount) : null,
        creditAmount: e.creditAmount ? Number(e.creditAmount) : null,
      }
      return {
        journalEntryId: e.id,
        confidence: calculateScheduleMatchScore(entry, matchableSchedule),
        description: e.description,
        date: e.date,
        amount: importoMovimento(entry, schedule.tipo),
      }
    })
    .filter((c) => c.confidence >= SCHEDULE_MATCH_THRESHOLDS.MINIMUM)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}
