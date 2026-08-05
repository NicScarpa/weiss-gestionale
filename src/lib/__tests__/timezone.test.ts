import { describe, it, expect } from 'vitest'
import {
  toRomeParts,
  romeDayStart,
  romeDayRange,
  romeMonthRange,
  toDateOnlyUtc,
  romeDateKey,
  romeTimeString,
  nextDateKey,
  romeInstant,
  timeColumnToMinutes,
} from '../timezone'

/**
 * Questi test hanno senso solo se girano su una macchina che NON è in orario
 * italiano: in CI il fuso è UTC. Su un Mac italiano passerebbero anche con
 * un'implementazione sbagliata, ed è esattamente il motivo per cui il bug è
 * arrivato in produzione.
 */
describe('toRomeParts', () => {
  it("d'inverno l'ora italiana è avanti di un'ora rispetto a UTC", () => {
    const parts = toRomeParts(new Date('2026-01-15T09:30:00Z'))

    expect(parts.dateKey).toBe('2026-01-15')
    expect(parts.minutesFromMidnight).toBe(10 * 60 + 30)
    expect(parts.utcOffsetMinutes).toBe(60)
  })

  it("d'estate l'ora legale porta lo scarto a due ore", () => {
    const parts = toRomeParts(new Date('2026-07-15T09:30:00Z'))

    expect(parts.dateKey).toBe('2026-07-15')
    expect(parts.minutesFromMidnight).toBe(11 * 60 + 30)
    expect(parts.utcOffsetMinutes).toBe(120)
  })

  it('un istante serale in UTC appartiene già al giorno dopo in Italia', () => {
    // Le 22:30 UTC del 5 agosto sono le 00:30 del 6 agosto a Roma.
    // È il caso che oggi manda la timbratura nel giorno sbagliato.
    const parts = toRomeParts(new Date('2026-08-05T22:30:00Z'))

    expect(parts.dateKey).toBe('2026-08-06')
    expect(parts.minutesFromMidnight).toBe(30)
  })

  it('riporta il giorno della settimana italiano, con domenica a zero', () => {
    // 2026-08-05 è un mercoledì
    expect(toRomeParts(new Date('2026-08-05T12:00:00Z')).weekday).toBe(3)
    // 2026-08-09 è una domenica
    expect(toRomeParts(new Date('2026-08-09T12:00:00Z')).weekday).toBe(0)
  })

  it('a cavallo del cambio di ora legale segue la transizione', () => {
    // L'ora legale 2026 inizia domenica 29 marzo alle 02:00 locali (01:00 UTC)
    expect(toRomeParts(new Date('2026-03-29T00:30:00Z')).utcOffsetMinutes).toBe(60)
    expect(toRomeParts(new Date('2026-03-29T01:30:00Z')).utcOffsetMinutes).toBe(120)
    // e finisce domenica 25 ottobre alle 03:00 locali (01:00 UTC)
    expect(toRomeParts(new Date('2026-10-25T00:30:00Z')).utcOffsetMinutes).toBe(120)
    expect(toRomeParts(new Date('2026-10-25T01:30:00Z')).utcOffsetMinutes).toBe(60)
  })
})

describe('romeDayStart', () => {
  it("d'inverno la mezzanotte italiana è le 23:00 UTC del giorno prima", () => {
    expect(romeDayStart('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z')
  })

  it("d'estate la mezzanotte italiana è le 22:00 UTC del giorno prima", () => {
    expect(romeDayStart('2026-08-06').toISOString()).toBe('2026-08-05T22:00:00.000Z')
  })

  it('è la funzione inversa di toRomeParts', () => {
    const parts = toRomeParts(romeDayStart('2026-08-06'))

    expect(parts.dateKey).toBe('2026-08-06')
    expect(parts.minutesFromMidnight).toBe(0)
  })
})

describe('romeDayRange', () => {
  it('delimita la giornata italiana per confrontare i timestamp', () => {
    const { start, end } = romeDayRange('2026-08-05')

    expect(start.toISOString()).toBe('2026-08-04T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-05T22:00:00.000Z')
  })

  it('nella notte in cui scatta l ora legale la giornata dura 23 ore', () => {
    const { start, end } = romeDayRange('2026-03-29')

    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000)
  })

  it('nella notte in cui torna l ora solare la giornata dura 25 ore', () => {
    const { start, end } = romeDayRange('2026-10-25')

    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000)
  })
})

describe('toDateOnlyUtc', () => {
  it('produce la mezzanotte UTC, come vuole una colonna di tipo Date', () => {
    // Le colonne @db.Date (es. ShiftAssignment.date) non hanno un orario:
    // Prisma le legge e le scrive come mezzanotte UTC. Confrontarle con
    // l'inizio della giornata italiana le sposterebbe di un giorno.
    expect(toDateOnlyUtc('2026-08-05').toISOString()).toBe(
      '2026-08-05T00:00:00.000Z'
    )
  })
})

describe('nextDateKey', () => {
  it('passa al giorno dopo, anche a cavallo di mese e di anno', () => {
    expect(nextDateKey('2026-08-05')).toBe('2026-08-06')
    expect(nextDateKey('2026-08-31')).toBe('2026-09-01')
    expect(nextDateKey('2026-12-31')).toBe('2027-01-01')
  })

  it('non si fa ingannare dal cambio di ora legale', () => {
    expect(nextDateKey('2026-03-29')).toBe('2026-03-30')
    expect(nextDateKey('2026-10-25')).toBe('2026-10-26')
  })
})

describe('romeDateKey', () => {
  it('dà il giorno italiano di un istante, che è quello che serve per il turno', () => {
    // Le 23:30 UTC del 4 agosto sono già l'1:30 del 5 agosto a Roma:
    // la timbratura appartiene al giorno 5.
    expect(romeDateKey(new Date('2026-08-04T23:30:00Z'))).toBe('2026-08-05')
  })
})

describe('romeTimeString', () => {
  it("d'estate le 19:00 UTC sono le 21:00 italiane", () => {
    expect(romeTimeString(new Date('2026-08-20T19:00:00Z'))).toBe('21:00')
  })

  it("d'inverno le 20:00 UTC sono le 21:00 italiane", () => {
    expect(romeTimeString(new Date('2026-01-15T20:00:00Z'))).toBe('21:00')
  })

  it('aggiunge lo zero iniziale ai minuti', () => {
    expect(romeTimeString(new Date('2026-08-20T19:05:00Z'))).toBe('21:05')
  })
})

describe('timeColumnToMinutes', () => {
  it('legge una colonna Time come orario italiano', () => {
    // Prisma restituisce una colonna @db.Time come Date del 1970 in UTC:
    // le 18:00 del turno sono 1970-01-01T18:00:00Z. Vanno lette in UTC,
    // altrimenti su una macchina italiana diventerebbero le 19 o le 20.
    expect(timeColumnToMinutes(new Date('1970-01-01T18:00:00.000Z'))).toBe(1080)
    expect(timeColumnToMinutes(new Date('1970-01-01T06:30:00.000Z'))).toBe(390)
  })
})

describe('romeInstant', () => {
  it('ricostruisce l istante assoluto di un orario italiano', () => {
    // Le 18:00 del 5 agosto in Italia sono le 16:00 UTC (ora legale)
    expect(romeInstant('2026-08-05', 18 * 60).toISOString()).toBe(
      '2026-08-05T16:00:00.000Z'
    )
    // ...ma d'inverno sono le 17:00 UTC
    expect(romeInstant('2026-01-15', 18 * 60).toISOString()).toBe(
      '2026-01-15T17:00:00.000Z'
    )
  })

  it('accetta orari oltre la mezzanotte, come la fine di un turno notturno', () => {
    // Un turno che finisce alle 03:00 del giorno dopo: minuto 1620
    expect(romeInstant('2026-08-05', 27 * 60).toISOString()).toBe(
      '2026-08-06T01:00:00.000Z'
    )
  })
})

describe('romeMonthRange', () => {
  it('copre il mese civile italiano, estremo finale escluso', () => {
    const { start, end } = romeMonthRange(2026, 8)

    expect(start.toISOString()).toBe('2026-07-31T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-31T22:00:00.000Z')
  })

  it('gestisce il mese in cui cambia l ora legale', () => {
    // Ottobre 2026 inizia con l'ora legale e finisce con quella solare
    const { start, end } = romeMonthRange(2026, 10)

    expect(start.toISOString()).toBe('2026-09-30T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-31T23:00:00.000Z')
  })
})
