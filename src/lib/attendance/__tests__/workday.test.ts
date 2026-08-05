import { describe, it, expect } from 'vitest'
import {
  groupPunchesByWorkday,
  toWorkdayMinutes,
  dstShiftBetween,
} from '../workday'

function p(punchType: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END', iso: string) {
  return { punchType, punchedAt: new Date(iso) }
}

/**
 * La giornata lavorativa non coincide con il giorno del calendario: chi entra
 * alle 21 ed esce all'una di notte ha lavorato una giornata sola, quella in cui
 * è entrato. Gli orari nei commenti sono italiani, gli istanti nei test UTC.
 */
describe('groupPunchesByWorkday', () => {
  it('tiene insieme entrata e uscita di una giornata diurna', () => {
    // 9:00 -> 17:00 del 20 agosto
    const giorni = groupPunchesByWorkday([
      p('IN', '2026-08-20T07:00:00Z'),
      p('OUT', '2026-08-20T15:00:00Z'),
    ])

    expect([...giorni.keys()]).toEqual(['2026-08-20'])
    expect(giorni.get('2026-08-20')).toHaveLength(2)
  })

  it('attribuisce l uscita dopo mezzanotte alla giornata in cui si è entrati', () => {
    // 21:00 del 20 -> 01:00 del 21
    const giorni = groupPunchesByWorkday([
      p('IN', '2026-08-20T19:00:00Z'),
      p('OUT', '2026-08-20T23:00:00Z'),
    ])

    expect([...giorni.keys()]).toEqual(['2026-08-20'])
    expect(giorni.get('2026-08-20')).toHaveLength(2)
  })

  it('tiene nella stessa giornata anche le pause di dopo mezzanotte', () => {
    const giorni = groupPunchesByWorkday([
      p('IN', '2026-08-20T19:00:00Z'),
      p('BREAK_START', '2026-08-20T22:00:00Z'),
      p('BREAK_END', '2026-08-20T22:30:00Z'),
      p('OUT', '2026-08-21T01:00:00Z'),
    ])

    expect([...giorni.keys()]).toEqual(['2026-08-20'])
    expect(giorni.get('2026-08-20')).toHaveLength(4)
  })

  it('separa due giornate distinte', () => {
    const giorni = groupPunchesByWorkday([
      p('IN', '2026-08-20T07:00:00Z'),
      p('OUT', '2026-08-20T15:00:00Z'),
      p('IN', '2026-08-21T07:00:00Z'),
      p('OUT', '2026-08-21T15:00:00Z'),
    ])

    expect([...giorni.keys()].sort()).toEqual(['2026-08-20', '2026-08-21'])
  })

  it('ordina le timbrature arrivate fuori sequenza', () => {
    // La sincronizzazione offline può consegnare l'uscita prima dell'entrata
    const giorni = groupPunchesByWorkday([
      p('OUT', '2026-08-20T23:00:00Z'),
      p('IN', '2026-08-20T19:00:00Z'),
    ])

    expect([...giorni.keys()]).toEqual(['2026-08-20'])
    expect(giorni.get('2026-08-20')![0].punchType).toBe('IN')
  })

  it('lascia al proprio giorno un uscita senza entrata', () => {
    const giorni = groupPunchesByWorkday([p('OUT', '2026-08-21T09:00:00Z')])

    expect([...giorni.keys()]).toEqual(['2026-08-21'])
  })

  it('non trascina l uscita oltre le 24 ore dall entrata', () => {
    // Un'entrata mai chiusa non deve inghiottire l'uscita di due giorni dopo:
    // in quel caso la giornata aperta resta senza uscita, com'è giusto.
    const giorni = groupPunchesByWorkday([
      p('IN', '2026-08-20T07:00:00Z'),
      p('OUT', '2026-08-22T15:00:00Z'),
    ])

    expect([...giorni.keys()].sort()).toEqual(['2026-08-20', '2026-08-22'])
  })

  it('apre una nuova giornata quando arriva una seconda entrata', () => {
    // Entrata di lunedì mai chiusa, poi entrata di martedì: sono due giornate
    const giorni = groupPunchesByWorkday([
      p('IN', '2026-08-20T07:00:00Z'),
      p('IN', '2026-08-21T07:00:00Z'),
      p('OUT', '2026-08-21T15:00:00Z'),
    ])

    expect([...giorni.keys()].sort()).toEqual(['2026-08-20', '2026-08-21'])
    expect(giorni.get('2026-08-21')).toHaveLength(2)
  })
})

describe('toWorkdayMinutes', () => {
  it('conta i minuti dalla mezzanotte italiana del giorno lavorativo', () => {
    // Le 19:00 UTC del 20 agosto sono le 21:00 italiane
    expect(toWorkdayMinutes(new Date('2026-08-20T19:00:00Z'), '2026-08-20')).toBe(21 * 60)
  })

  it('supera i 1440 minuti per le timbrature dopo la mezzanotte', () => {
    // L'uscita all'01:00 del 21 appartiene alla giornata del 20: minuto 1500
    expect(toWorkdayMinutes(new Date('2026-08-20T23:00:00Z'), '2026-08-20')).toBe(25 * 60)
  })

  it("d'inverno tiene conto dell'ora solare", () => {
    // Le 20:00 UTC del 15 gennaio sono le 21:00 italiane
    expect(toWorkdayMinutes(new Date('2026-01-15T20:00:00Z'), '2026-01-15')).toBe(21 * 60)
  })
})

describe('dstShiftBetween', () => {
  it('è zero in una giornata normale', () => {
    expect(
      dstShiftBetween(
        new Date('2026-08-20T19:00:00Z'),
        new Date('2026-08-20T23:00:00Z')
      )
    ).toBe(0)
  })

  it("vale un'ora nella notte in cui l'orologio va avanti", () => {
    expect(
      dstShiftBetween(
        new Date('2026-03-28T21:00:00Z'),
        new Date('2026-03-29T01:00:00Z')
      )
    ).toBe(60)
  })

  it("vale un'ora negativa nella notte in cui l'orologio torna indietro", () => {
    expect(
      dstShiftBetween(
        new Date('2026-10-24T20:00:00Z'),
        new Date('2026-10-25T02:00:00Z')
      )
    ).toBe(-60)
  })
})
