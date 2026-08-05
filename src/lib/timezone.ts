import { TZDate } from '@date-fns/tz'

/**
 * L'UNICO punto dell'applicazione che parla di fusi orari.
 *
 * Il resto del codice deve ragionare o su istanti assoluti (`Date`, cioè UTC)
 * oppure su "parti civili italiane" (giorno + minuti dalla mezzanotte), mai su
 * `getHours()` / `startOfDay()` applicati direttamente a una `Date`: quelli
 * usano il fuso della macchina, che in sviluppo è italiano e in produzione è
 * UTC. È così che le ore notturne slittavano di un'ora e le uscite dopo
 * mezzanotte finivano nel giorno sbagliato.
 */
export const APP_TIMEZONE = 'Europe/Rome'

export interface RomeParts {
  /** Giorno civile italiano in formato 'yyyy-MM-dd'. */
  dateKey: string
  /** Minuti trascorsi dalla mezzanotte italiana, da 0 a 1439. */
  minutesFromMidnight: number
  /** Giorno della settimana, 0 = domenica (come `Date.getDay`). */
  weekday: number
  /**
   * Scarto rispetto a UTC in minuti: +60 con l'ora solare, +120 con l'ora
   * legale. Serve a misurare le ore realmente lavorate nelle notti in cui
   * l'orologio si sposta.
   */
  utcOffsetMinutes: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Traduce un istante assoluto nelle sue parti civili italiane. */
export function toRomeParts(instant: Date): RomeParts {
  const rome = new TZDate(instant, APP_TIMEZONE)

  return {
    dateKey: `${rome.getFullYear()}-${pad(rome.getMonth() + 1)}-${pad(rome.getDate())}`,
    minutesFromMidnight: rome.getHours() * 60 + rome.getMinutes(),
    weekday: rome.getDay(),
    utcOffsetMinutes: -rome.getTimezoneOffset(),
  }
}

/** Il giorno italiano a cui appartiene un istante, in formato 'yyyy-MM-dd'. */
export function romeDateKey(instant: Date): string {
  return toRomeParts(instant).dateKey
}

/**
 * L'orario italiano di un istante, in formato 'HH:mm'. Per le colonne
 * leggibili di export e risposta API: `format(date, 'HH:mm')` userebbe il
 * fuso della macchina, e in produzione sposterebbe ogni orario di 1-2 ore.
 */
export function romeTimeString(instant: Date): string {
  const { minutesFromMidnight } = toRomeParts(instant)
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** L'istante assoluto in cui inizia il giorno italiano indicato. */
export function romeDayStart(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(
    new TZDate(year, month - 1, day, 0, 0, 0, 0, APP_TIMEZONE).getTime()
  )
}

/**
 * Minuti dalla mezzanotte contenuti in una colonna `@db.Time`.
 *
 * Prisma restituisce quelle colonne come `Date` del 1° gennaio 1970 in UTC:
 * un turno che inizia alle 18:00 diventa `1970-01-01T18:00:00Z`. Vanno quindi
 * lette in UTC — `getHours()` restituirebbe le 19 o le 20 su una macchina
 * italiana, e il valore giusto solo per coincidenza su un server in UTC.
 */
export function timeColumnToMinutes(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes()
}

/**
 * L'istante assoluto corrispondente a un orario civile italiano.
 * I minuti possono superare i 1440: la fine di un turno notturno alle 03:00
 * del giorno dopo è il minuto 1620 della giornata in cui il turno è iniziato.
 */
export function romeInstant(dateKey: string, minutesFromMidnight: number): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60

  return new Date(
    new TZDate(year, month - 1, day, hours, minutes, 0, 0, APP_TIMEZONE).getTime()
  )
}

/**
 * Il giorno civile successivo. Si calcola sulla mezzanotte UTC, che non conosce
 * ora legale: sommare 24 ore all'inizio della giornata italiana sbaglierebbe
 * nelle due notti in cui l'orologio si sposta.
 */
export function nextDateKey(dateKey: string): string {
  const next = new Date(toDateOnlyUtc(dateKey).getTime() + 24 * 60 * 60 * 1000)

  return next.toISOString().slice(0, 10)
}

/** Il giorno civile precedente. */
export function previousDateKey(dateKey: string): string {
  const previous = new Date(
    toDateOnlyUtc(dateKey).getTime() - 24 * 60 * 60 * 1000
  )

  return previous.toISOString().slice(0, 10)
}

/**
 * Estremi della giornata italiana: `start` incluso, `end` escluso.
 * Da usare per filtrare colonne di tipo timestamp (`punchedAt`, `createdAt`).
 * Nelle notti del cambio d'ora la giornata dura 23 o 25 ore, e va bene così.
 */
export function romeDayRange(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split('-').map(Number)
  const next = new TZDate(year, month - 1, day + 1, 0, 0, 0, 0, APP_TIMEZONE)

  return {
    start: romeDayStart(dateKey),
    end: new Date(next.getTime()),
  }
}

/**
 * Mezzanotte UTC del giorno indicato, che è come Prisma rappresenta le colonne
 * `@db.Date` — un giorno civile senza orario, per esempio `ShiftAssignment.date`.
 * Confrontare quelle colonne con `romeDayStart` le sposterebbe al giorno prima.
 */
export function toDateOnlyUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

/**
 * Estremi del mese civile italiano: `start` incluso, `end` escluso.
 * Da usare al posto di `startOfMonth(new Date(anno, mese - 1))`, che sul server
 * in UTC restituisce il mese sfalsato di un'ora.
 */
export function romeMonthRange(
  year: number,
  month: number
): { start: Date; end: Date } {
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1

  return {
    start: romeDayStart(`${year}-${pad(month)}-01`),
    end: romeDayStart(`${nextYear}-${pad(nextMonth)}-01`),
  }
}
