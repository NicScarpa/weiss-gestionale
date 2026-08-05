import { describe, it, expect } from 'vitest'
import { computeRecognizedDay, roundEntry, roundExit } from '../timekeeping-engine'
import { at, inAt, makeContext, makePolicy, outAt, punch } from './fixtures'

describe('roundEntry', () => {
  it("senza intervallo lascia l'orario com'è", () => {
    expect(roundEntry(at(9, 7), { intervalMinutes: 1, toleranceMinutes: 0 })).toBe(at(9, 7))
  })

  it('entro la tolleranza tiene l orario esatto', () => {
    // L'esempio del prodotto: intervallo 30, tolleranza 5, entrata alle 9:03
    expect(roundEntry(at(9, 3), { intervalMinutes: 30, toleranceMinutes: 5 })).toBe(at(9, 3))
  })

  it('oltre la tolleranza sale al confine successivo', () => {
    // Stesso esempio: alle 9:06 l'entrata diventa 9:30
    expect(roundEntry(at(9, 6), { intervalMinutes: 30, toleranceMinutes: 5 })).toBe(at(9, 30))
  })

  it('sul confine esatto non muove nulla', () => {
    expect(roundEntry(at(9), { intervalMinutes: 30, toleranceMinutes: 5 })).toBe(at(9))
  })
})

describe('roundExit', () => {
  it('entro la tolleranza tiene l orario esatto', () => {
    // Uscita alle 18:03 con intervallo 30 e tolleranza 5: i minuti non si tagliano
    expect(roundExit(at(18, 3), { intervalMinutes: 30, toleranceMinutes: 5 })).toBe(at(18, 3))
  })

  it('oltre la tolleranza scende al confine precedente', () => {
    expect(roundExit(at(18, 20), { intervalMinutes: 30, toleranceMinutes: 5 })).toBe(at(18))
  })
})

describe('computeRecognizedDay', () => {
  it('conta le ore fra entrata e uscita, tolta la pausa pranzo', () => {
    // 09:00 -> 18:00 con un'ora di pranzo: otto ore
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18))],
      makePolicy(),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(8))
    expect(giorno.breakMinutes).toBe(60)
    expect(giorno.ordinaryMinutes).toBe(at(8))
    expect(giorno.overtimeMinutes).toBe(0)
  })

  it('non conta il lavoro fatto prima dell inizio giornata', () => {
    // Arriva alle 08:00 ma la giornata inizia alle 09:00 e non c'è flessibilità
    const giorno = computeRecognizedDay(
      [inAt(at(8)), outAt(at(18))],
      makePolicy(),
      makeContext()
    )

    expect(giorno.clockIn).toBe(at(9))
    expect(giorno.workedMinutes).toBe(at(8))
  })

  it('riconosce l anticipo che rientra nella flessibilità', () => {
    // Con quindici minuti di flessibilità, entrare alle 08:50 conta davvero
    const giorno = computeRecognizedDay(
      [inAt(at(8, 50)), outAt(at(18))],
      makePolicy({ flexMinutes: 15 }),
      makeContext()
    )

    expect(giorno.clockIn).toBe(at(8, 50))
    expect(giorno.workedMinutes).toBe(at(8) + 10)
  })

  it('taglia l anticipo che eccede la flessibilità', () => {
    // Arriva alle 08:00 con flessibilità di quindici minuti: si conta dalle 08:45
    const giorno = computeRecognizedDay(
      [inAt(at(8)), outAt(at(18))],
      makePolicy({ flexMinutes: 15 }),
      makeContext()
    )

    expect(giorno.clockIn).toBe(at(8, 45))
  })

  it('taglia il trattenersi oltre la fine giornata più la flessibilità', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(20))],
      makePolicy({ flexMinutes: 15 }),
      makeContext()
    )

    expect(giorno.clockOut).toBe(at(18, 15))
  })

  it('deduce la pausa pranzo anche se non è stata timbrata, e lo segnala', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18))],
      makePolicy(),
      makeContext()
    )

    expect(giorno.breakMinutes).toBe(60)
    expect(giorno.warnings).toContain('PAUSA_PRANZO_NON_TIMBRATA')
  })

  it('usa la pausa realmente timbrata invece di quella teorica', () => {
    // Pausa vera di trenta minuti: si contano quelli, non l'ora della regola
    const giorno = computeRecognizedDay(
      [
        inAt(at(9)),
        punch('BREAK_START', at(13)),
        punch('BREAK_END', at(13, 30)),
        outAt(at(18)),
      ],
      makePolicy(),
      makeContext()
    )

    expect(giorno.breakMinutes).toBe(30)
    expect(giorno.workedMinutes).toBe(at(8) + 30)
    expect(giorno.warnings).not.toContain('PAUSA_PRANZO_NON_TIMBRATA')
  })

  it('non deduce la pausa pranzo se il turno non la attraversa', () => {
    // Turno del mattino che finisce prima delle 13
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(12))],
      makePolicy(),
      makeContext()
    )

    expect(giorno.breakMinutes).toBe(0)
    expect(giorno.workedMinutes).toBe(at(3))
  })

  it('deduce anche le pause aggiuntive previste dalla regola', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18))],
      makePolicy({
        extraBreaks: [{ name: 'Merenda', startMinutes: at(16), endMinutes: at(16, 15) }],
      }),
      makeContext()
    )

    expect(giorno.breakMinutes).toBe(75)
    expect(giorno.workedMinutes).toBe(at(8) - 15)
  })

  it('applica gli arrotondamenti a entrata e uscita', () => {
    // Entra alle 9:06 (diventa 9:30), esce alle 18:20 (diventa 18:00)
    const giorno = computeRecognizedDay(
      [inAt(at(9, 6)), outAt(at(18, 20))],
      makePolicy({
        flexMinutes: 30,
        entryRounding: { intervalMinutes: 30, toleranceMinutes: 5 },
        exitRounding: { intervalMinutes: 30, toleranceMinutes: 5 },
      }),
      makeContext()
    )

    expect(giorno.clockIn).toBe(at(9, 30))
    expect(giorno.clockOut).toBe(at(18))
    expect(giorno.workedMinutes).toBe(at(7, 30))
  })

  it('conta lo straordinario oltre le ore da contratto', () => {
    // 09:00 -> 20:00 con fine giornata spostata: dieci ore lavorate su otto di contratto
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(20))],
      makePolicy({ dayEndMinutes: at(20) }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(10))
    expect(giorno.ordinaryMinutes).toBe(at(8))
    expect(giorno.overtimeMinutes).toBe(at(2))
  })

  it('non conta le ore oltre il tetto giornaliero', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(20))],
      makePolicy({ dayEndMinutes: at(20), maxDailyMinutes: at(9) }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(9))
    expect(giorno.cappedMinutes).toBe(at(1))
  })

  it('conta tutte le ore del sabato come straordinario, se la regola lo prevede', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18))],
      makePolicy({ saturdayAsOvertime: true }),
      makeContext({ weekday: 6 })
    )

    expect(giorno.overtimeMinutes).toBe(at(8))
    expect(giorno.ordinaryMinutes).toBe(0)
  })

  it('conta come festive tutte le ore di domenica', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18))],
      makePolicy(),
      makeContext({ weekday: 0 })
    )

    expect(giorno.holidayMinutes).toBe(at(8))
    expect(giorno.ordinaryMinutes).toBe(0)
    expect(giorno.overtimeMinutes).toBe(0)
  })

  it('conta come festive le ore dei giorni di festa', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18))],
      makePolicy(),
      makeContext({ isHoliday: true })
    )

    expect(giorno.holidayMinutes).toBe(at(8))
  })

  it('scorpora le ore notturne dalle ordinarie, senza contarle due volte', () => {
    // Turno 18:00 -> 02:00 su una giornata che va dalle 18 alle 3
    const giorno = computeRecognizedDay(
      [inAt(at(18)), outAt(at(26))],
      makePolicy({
        dayStartMinutes: at(18),
        dayEndMinutes: at(3),
        lunch: null,
        contractDailyMinutes: at(8),
      }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(8))
    expect(giorno.nightMinutes).toBe(at(4))
    expect(giorno.ordinaryMinutes + giorno.nightMinutes + giorno.overtimeMinutes).toBe(at(8))
  })

  it('gestisce la giornata che scavalca la mezzanotte', () => {
    // Giornata 06:00 -> 03:00, turno serale 21:00 -> 02:00
    const giorno = computeRecognizedDay(
      [inAt(at(21)), outAt(at(26))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(3), lunch: null }),
      makeContext()
    )

    expect(giorno.clockIn).toBe(at(21))
    expect(giorno.clockOut).toBe(at(26))
    expect(giorno.workedMinutes).toBe(at(5))
  })

  it('con la timbratura singola riconosce la giornata intera', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9))],
      makePolicy({ singlePunchMode: true }),
      makeContext()
    )

    // Dalle 9 alle 18 meno l'ora di pranzo
    expect(giorno.workedMinutes).toBe(at(8))
    expect(giorno.warnings).not.toContain('USCITA_MANCANTE')
  })

  it('segnala l entrata senza uscita e non inventa ore', () => {
    const giorno = computeRecognizedDay([inAt(at(9))], makePolicy(), makeContext())

    expect(giorno.workedMinutes).toBe(0)
    expect(giorno.warnings).toContain('USCITA_MANCANTE')
  })

  it('segnala l uscita senza entrata', () => {
    const giorno = computeRecognizedDay([outAt(at(18))], makePolicy(), makeContext())

    expect(giorno.workedMinutes).toBe(0)
    expect(giorno.warnings).toContain('ENTRATA_MANCANTE')
  })

  it('non produce ore negative se l uscita precede l entrata', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(18)), outAt(at(9))],
      makePolicy(),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(0)
  })

  it('senza finestra definita conta le ore così come sono state timbrate', () => {
    // È il comportamento di chi non ha una regola assegnata: nessun taglio
    const giorno = computeRecognizedDay(
      [inAt(at(6)), outAt(at(23))],
      makePolicy({
        dayStartMinutes: null,
        dayEndMinutes: null,
        lunch: null,
        contractDailyMinutes: null,
      }),
      makeContext()
    )

    expect(giorno.clockIn).toBe(at(6))
    expect(giorno.clockOut).toBe(at(23))
    expect(giorno.workedMinutes).toBe(at(17))
    expect(giorno.warnings).not.toContain('FUORI_FINESTRA')
  })

  it('senza finestra e senza ore da contratto non inventa straordinari', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(20))],
      makePolicy({
        dayStartMinutes: null,
        dayEndMinutes: null,
        lunch: null,
        contractDailyMinutes: null,
      }),
      makeContext()
    )

    expect(giorno.overtimeMinutes).toBe(0)
    expect(giorno.ordinaryMinutes).toBe(at(11))
  })

  it('nella notte in cui l orologio va avanti conta le ore realmente lavorate', () => {
    // 29 marzo: turno 22:00 -> 03:00. L'orologio segna cinque ore, ma alle 02:00
    // salta alle 03:00 e le ore lavorate sono quattro.
    const giorno = computeRecognizedDay(
      [inAt(at(22)), outAt(at(27))],
      makePolicy({ dayStartMinutes: at(22), dayEndMinutes: at(3), lunch: null }),
      makeContext({ dstShiftMinutes: 60 })
    )

    expect(giorno.workedMinutes).toBe(at(4))
    expect(giorno.nightMinutes).toBe(at(4))
  })

  it('nella notte in cui l orologio torna indietro conta l ora in più', () => {
    // 25 ottobre: stesso turno d'orologio, ma le ore lavorate sono sei.
    const giorno = computeRecognizedDay(
      [inAt(at(22)), outAt(at(27))],
      makePolicy({ dayStartMinutes: at(22), dayEndMinutes: at(3), lunch: null }),
      makeContext({ dstShiftMinutes: -60 })
    )

    expect(giorno.workedMinutes).toBe(at(6))
    expect(giorno.nightMinutes).toBe(at(6))
  })

  it('lascia una traccia leggibile dei passaggi, per il calcolatore di prova', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(8)), outAt(at(18, 20))],
      makePolicy({
        flexMinutes: 15,
        exitRounding: { intervalMinutes: 30, toleranceMinutes: 5 },
      }),
      makeContext()
    )

    expect(giorno.steps.length).toBeGreaterThan(0)
    expect(giorno.steps.join(' ')).toContain('flessibilità')
  })
})
