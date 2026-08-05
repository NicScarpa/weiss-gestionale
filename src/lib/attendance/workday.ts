import { romeDateKey, toDateOnlyUtc, toRomeParts } from '@/lib/timezone'

const MINUTES_PER_DAY = 24 * 60

/**
 * Una giornata lavorativa non coincide con il giorno del calendario: chi entra
 * alle 21:00 ed esce all'01:00 ha lavorato una giornata sola, quella in cui è
 * entrato. Raggruppare per giorno civile — come si faceva prima — spezzava quel
 * turno in due, lasciando l'entrata senza uscita e l'uscita senza entrata.
 */

/** Oltre questa distanza dall'entrata, un'uscita non appartiene più a quel turno. */
const MAX_SHIFT_DURATION_MS = 24 * 60 * 60 * 1000

export interface PunchLike {
  punchType: string
  punchedAt: Date
}

/**
 * Raggruppa le timbrature per giornata lavorativa.
 *
 * La giornata è identificata dal giorno italiano dell'entrata; le timbrature
 * successive le appartengono finché non arriva una nuova entrata o non passano
 * 24 ore. Un'uscita orfana resta nel proprio giorno, così resta visibile invece
 * di sparire.
 */
export function groupPunchesByWorkday<T extends PunchLike>(
  punches: T[]
): Map<string, T[]> {
  const ordered = [...punches].sort(
    (a, b) => a.punchedAt.getTime() - b.punchedAt.getTime()
  )
  const days = new Map<string, T[]>()

  let openDay: string | null = null
  let openedAt: number | null = null

  const add = (day: string, punch: T) => {
    const list = days.get(day)
    if (list) {
      list.push(punch)
    } else {
      days.set(day, [punch])
    }
  }

  for (const punch of ordered) {
    const civilDay = romeDateKey(punch.punchedAt)

    if (punch.punchType === 'IN') {
      openDay = civilDay
      openedAt = punch.punchedAt.getTime()
      add(civilDay, punch)
      continue
    }

    const withinOpenShift =
      openDay !== null &&
      openedAt !== null &&
      punch.punchedAt.getTime() - openedAt <= MAX_SHIFT_DURATION_MS

    if (withinOpenShift) {
      add(openDay!, punch)
      // L'uscita chiude la giornata: quello che arriva dopo (un'uscita orfana
      // del giorno successivo, per esempio) non le appartiene più.
      if (punch.punchType === 'OUT') {
        openDay = null
        openedAt = null
      }
    } else {
      openDay = null
      openedAt = null
      add(civilDay, punch)
    }
  }

  return days
}

/**
 * Posizione di una timbratura dentro la sua giornata lavorativa, in minuti
 * dalla mezzanotte italiana del giorno in cui la giornata è iniziata.
 *
 * È il ponte fra i dati reali e il motore di calcolo, che ragiona su interi.
 * Il valore supera i 1440 per le timbrature dopo la mezzanotte: l'uscita
 * all'01:00 del giorno dopo è il minuto 1500.
 */
export function toWorkdayMinutes(punchedAt: Date, workdayKey: string): number {
  const parts = toRomeParts(punchedAt)
  const dayOffset = Math.round(
    (toDateOnlyUtc(parts.dateKey).getTime() - toDateOnlyUtc(workdayKey).getTime()) /
      (MINUTES_PER_DAY * 60 * 1000)
  )

  return parts.minutesFromMidnight + dayOffset * MINUTES_PER_DAY
}

/**
 * Minuti che l'orologio ha guadagnato fra i due istanti: +60 nella notte di
 * fine marzo in cui salta avanti, -60 in quella di fine ottobre, 0 sempre
 * altrimenti. Il motore lo usa per non pagare l'ora mai vissuta e per pagare
 * quella vissuta due volte.
 */
export function dstShiftBetween(start: Date, end: Date): number {
  return toRomeParts(end).utcOffsetMinutes - toRomeParts(start).utcOffsetMinutes
}
