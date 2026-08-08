import { describe, it, expect } from 'vitest'
import { computeRecognizedDay, roundEntry, roundExit } from '../timekeeping-engine'
import {
  at,
  inAt,
  makeContext,
  makePolicy,
  outAt,
  outCorretta,
  outDiSistema,
  punch,
} from './fixtures'

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

  it('non paga il buco fra i due turni di un turno spezzato', () => {
    // 07:00-13:00 e 17:00-22:00: undici ore, non quindici. È il caso
    // quotidiano del bar, e il buco del pomeriggio non è lavoro.
    const giorno = computeRecognizedDay(
      [inAt(at(7)), outAt(at(13)), inAt(at(17)), outAt(at(22))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(11))
    expect(giorno.ordinaryMinutes).toBe(at(8))
    expect(giorno.overtimeMinutes).toBe(at(3))
  })

  it('un secondo turno rimasto aperto non annulla il primo', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(7)), outAt(at(13)), inAt(at(17))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(6))
    expect(giorno.warnings).toContain('USCITA_MANCANTE')
  })

  it("una doppia uscita estende il turno invece di restare orfana", () => {
    const giorno = computeRecognizedDay(
      [inAt(at(17)), outAt(at(22)), outAt(at(22, 5))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.clockOut).toBe(at(22, 5))
    expect(giorno.workedMinutes).toBe(at(5) + 5)
  })

  it("sul confine della tolleranza la doppia uscita estende ancora", () => {
    const giorno = computeRecognizedDay(
      [inAt(at(17)), outAt(at(22)), outAt(at(22, 15))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.clockOut).toBe(at(22, 15))
    expect(giorno.workedMinutes).toBe(at(5) + 15)
  })

  it("oltre la tolleranza l'uscita orfana non estende il turno", () => {
    // Un minuto oltre il confine: non è più il doppio tocco sul telefono.
    const giorno = computeRecognizedDay(
      [inAt(at(17)), outAt(at(22)), outAt(at(22, 16))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.clockOut).toBe(at(22))
    expect(giorno.workedMinutes).toBe(at(5))
    expect(giorno.warnings).toContain('ENTRATA_MANCANTE')
  })

  it('chi rientra dalla pausa senza timbrare non si fa pagare la pausa', () => {
    // Il caso dell'audit W5-F3 difetto 1, eseguito sul motore: Giulia entra
    // alle 9, esce alle 13, rientra alle 17 senza timbrare e timbra l'uscita
    // alle 22. Prima si vedeva pagare 780 minuti — 13 ore invece di 4, cioè
    // 123 € lordi in più in un giorno, con la lista degli avvisi VUOTA.
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(13)), outAt(at(22))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(4))
    expect(giorno.clockOut).toBe(at(13))
    expect(giorno.warnings).toContain('ENTRATA_MANCANTE')
  })

  it("l'uscita orfana non gonfia nemmeno il turno spezzato", () => {
    // Stesso difetto sul turno spezzato: 750 minuti invece di 660.
    const giorno = computeRecognizedDay(
      [inAt(at(7)), outAt(at(13)), inAt(at(17)), outAt(at(22)), outAt(at(23, 30))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(24), lunch: null }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(11))
    expect(giorno.warnings).toContain('ENTRATA_MANCANTE')
  })

  it('una correzione approvata batte l uscita scritta dal sistema', () => {
    // Difetto 6 dell'audit W5-F3. La chiusura automatica ha scritto le 13:15,
    // il dipendente ha chiesto la correzione alle 13:05 e un responsabile
    // l'ha approvata. Senza distinguere le due, il motore teneva la più
    // tarda: le dodici ore sbagliate si toglievano solo entrando nel
    // database, perché nessuna route modifica una timbratura.
    const giorno = computeRecognizedDay(
      [inAt(at(7)), outCorretta(at(13, 5)), outDiSistema(at(13, 15))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.clockOut).toBe(at(13, 5))
    expect(giorno.workedMinutes).toBe(at(6) + 5)
  })

  it('la correzione vale anche quando il sistema aveva sbagliato di ore', () => {
    // Il caso dell'auto-clockout a entrata+12h: uscita inventata alle 18:58,
    // correzione approvata alle 13:05. La giornata è stata sistemata da un
    // umano, quindi NON deve restare segnalata come dato sporco.
    const giorno = computeRecognizedDay(
      [inAt(at(6, 58)), outCorretta(at(13, 5)), outDiSistema(at(18, 58))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.clockOut).toBe(at(13, 5))
    expect(giorno.workedMinutes).toBe(367)
    expect(giorno.warnings).not.toContain('ENTRATA_MANCANTE')
  })

  it("senza correzione l'uscita di sistema resta quella buona", () => {
    // Il comportamento da NON rompere: se nessuno ha corretto, l'orario
    // scritto dal sistema è l'unico che c'è.
    const giorno = computeRecognizedDay(
      [inAt(at(7)), outDiSistema(at(13, 15))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.clockOut).toBe(at(13, 15))
    expect(giorno.workedMinutes).toBe(at(6) + 15)
  })

  it('una correzione non cancella le timbrature vere del dipendente', () => {
    // La correzione sostituisce ciò che ha scritto il SISTEMA, non i fatti:
    // il turno spezzato timbrato davvero resta intero.
    const giorno = computeRecognizedDay(
      [inAt(at(7)), outAt(at(13)), inAt(at(17)), outCorretta(at(22))],
      makePolicy({ dayStartMinutes: at(6), dayEndMinutes: at(23), lunch: null }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(at(11))
  })

  it("arrotonda l'entrata di ciascun turno, non solo la prima", () => {
    // 9:06 -> 9:30 e 17:06 -> 17:30 con intervallo 30 e tolleranza 5
    const giorno = computeRecognizedDay(
      [inAt(at(9, 6)), outAt(at(13)), inAt(at(17, 6)), outAt(at(22))],
      makePolicy({
        dayStartMinutes: at(6),
        dayEndMinutes: at(23),
        lunch: null,
        entryRounding: { intervalMinutes: 30, toleranceMinutes: 5 },
      }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(210 + 270)
  })

  it('nel feriale lo straordinario prevale sulle notturne, e la somma torna', () => {
    // 22:00 -> 06:00, contratto 400 min: ogni minuto in una sola categoria
    const giorno = computeRecognizedDay(
      [inAt(at(22)), outAt(at(30))],
      makePolicy({
        dayStartMinutes: null,
        dayEndMinutes: null,
        lunch: null,
        contractDailyMinutes: 400,
      }),
      makeContext()
    )

    expect(giorno.workedMinutes).toBe(480)
    expect(giorno.overtimeMinutes).toBe(80)
    expect(giorno.nightMinutes).toBe(400)
    expect(giorno.ordinaryMinutes).toBe(0)
    expect(
      giorno.ordinaryMinutes +
        giorno.overtimeMinutes +
        giorno.nightMinutes +
        giorno.holidayMinutes
    ).toBe(480)
  })

  it('il sabato da straordinario non paga il turno notturno due volte', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(22)), outAt(at(30))],
      makePolicy({
        dayStartMinutes: null,
        dayEndMinutes: null,
        lunch: null,
        contractDailyMinutes: 400,
        saturdayAsOvertime: true,
      }),
      makeContext({ weekday: 6 })
    )

    expect(giorno.overtimeMinutes).toBe(480)
    expect(giorno.nightMinutes).toBe(0)
    expect(
      giorno.ordinaryMinutes +
        giorno.overtimeMinutes +
        giorno.nightMinutes +
        giorno.holidayMinutes
    ).toBe(480)
  })

  it('nel festivo le ore notturne sono festive una volta sola', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(22)), outAt(at(30))],
      makePolicy({
        dayStartMinutes: null,
        dayEndMinutes: null,
        lunch: null,
        contractDailyMinutes: 400,
      }),
      makeContext({ isHoliday: true })
    )

    expect(giorno.holidayMinutes).toBe(480)
    expect(giorno.nightMinutes).toBe(0)
    expect(
      giorno.ordinaryMinutes +
        giorno.overtimeMinutes +
        giorno.nightMinutes +
        giorno.holidayMinutes
    ).toBe(480)
  })

  it('una pausa caffè timbrata non vale come pausa pranzo', () => {
    const giorno = computeRecognizedDay(
      [
        inAt(at(9)),
        punch('BREAK_START', at(10)),
        punch('BREAK_END', at(10, 15)),
        outAt(at(18)),
      ],
      makePolicy(),
      makeContext()
    )

    expect(giorno.breakMinutes).toBe(75)
    expect(giorno.workedMinutes).toBe(465)
    expect(giorno.warnings).toContain('PAUSA_PRANZO_NON_TIMBRATA')
  })

  it('la pausa timbrata dentro una pausa della regola non si deduce due volte', () => {
    const giorno = computeRecognizedDay(
      [
        inAt(at(9)),
        punch('BREAK_START', at(16)),
        punch('BREAK_END', at(16, 15)),
        outAt(at(18)),
      ],
      makePolicy({
        lunch: null,
        extraBreaks: [{ name: 'Merenda', startMinutes: at(16), endMinutes: at(16, 15) }],
      }),
      makeContext()
    )

    expect(giorno.breakMinutes).toBe(15)
    expect(giorno.workedMinutes).toBe(at(8) + 45)
  })

  it('deduce la pausa della regola che cade dopo la mezzanotte', () => {
    // Giornata 18:00-03:00 con pausa cena 00:30-01:00: la finestra della pausa
    // è scritta come orario del mattino, ma cade dentro il turno notturno.
    const giorno = computeRecognizedDay(
      [inAt(at(18)), outAt(at(27))],
      makePolicy({
        dayStartMinutes: at(18),
        dayEndMinutes: at(3),
        lunch: null,
        contractDailyMinutes: null,
        extraBreaks: [{ name: 'Cena', startMinutes: at(0, 30), endMinutes: at(1) }],
      }),
      makeContext()
    )

    expect(giorno.breakMinutes).toBe(30)
    expect(giorno.workedMinutes).toBe(at(8) + 30)
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

describe('computeRecognizedDay — la giornata segue il turno pianificato', () => {
  // Regola come da decisioni di prodotto: blocchi di 30 minuti con 10 di
  // tolleranza, ancorati all'orario del turno. Nessuna finestra fissa.
  const regolaTurno = makePolicy({
    useShiftAsWindow: true,
    dayStartMinutes: null,
    dayEndMinutes: null,
    lunch: null,
    entryRounding: { intervalMinutes: 30, toleranceMinutes: 10 },
    exitRounding: { intervalMinutes: 30, toleranceMinutes: 10 },
  })

  it("l'anticipo sul turno non conta: si parte dall'orario pianificato", () => {
    // Turno 9:00-17:00, timbra 8:51: entrata riconosciuta 9:00
    const giorno = computeRecognizedDay(
      [inAt(at(8, 51)), outAt(at(17))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(9), endMinutes: at(17) }] })
    )

    expect(giorno.clockIn).toBe(at(9))
    expect(giorno.workedMinutes).toBe(at(8))
  })

  it('il ritardo oltre la tolleranza salta al blocco successivo dal turno', () => {
    // Turno 8:30-17:00, timbra 8:51: 21 minuti di ritardo, oltre i 10 di
    // tolleranza: entrata riconosciuta 9:00 (8:30 + un blocco da 30)
    const giorno = computeRecognizedDay(
      [inAt(at(8, 51)), outAt(at(17))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(8, 30), endMinutes: at(17) }] })
    )

    expect(giorno.clockIn).toBe(at(9))
    expect(giorno.workedMinutes).toBe(at(8))
  })

  it('il ritardo entro la tolleranza resta quello timbrato', () => {
    // Turno 8:30, timbra 8:38: 8 minuti di ritardo, entro i 10: contato 8:38
    const giorno = computeRecognizedDay(
      [inAt(at(8, 38)), outAt(at(17))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(8, 30), endMinutes: at(17) }] })
    )

    expect(giorno.clockIn).toBe(at(8, 38))
    expect(giorno.workedMinutes).toBe(at(17) - at(8, 38))
  })

  it('pochi minuti oltre la fine del turno non fanno rumore', () => {
    // Turno fino alle 17:00, esce alle 17:07: entro la tolleranza, contato
    // e nessuna segnalazione
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(17, 7))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(9), endMinutes: at(17) }] })
    )

    expect(giorno.workedMinutes).toBe(at(8) + 7)
    expect(giorno.warnings).not.toContain('OLTRE_TURNO')
  })

  it('ben oltre la fine del turno: le ore restano sospese finché nessuno decide', () => {
    // Turno fino alle 17:00, esce alle 18:30: 90 minuti oltre. Non si
    // pagano e non si buttano: restano in attesa che un umano capisca se
    // era lavoro o un'uscita timbrata tardi. Il mese non si chiude finché
    // l'anomalia non è decisa.
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18, 30))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(9), endMinutes: at(17) }] })
    )

    expect(giorno.workedMinutes).toBe(at(8))
    expect(giorno.overtimeMinutes).toBe(0)
    expect(giorno.pendingReviewMinutes).toBe(90)
    expect(giorno.warnings).toContain('OLTRE_TURNO')
  })

  it('le ore oltre il turno approvate contano come straordinario, senza più segnali', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18, 30))],
      regolaTurno,
      makeContext({
        shiftWindows: [{ startMinutes: at(9), endMinutes: at(17) }],
        shiftReview: { overtime: 'APPROVED' },
      })
    )

    expect(giorno.workedMinutes).toBe(at(9, 30))
    expect(giorno.overtimeMinutes).toBe(90)
    expect(giorno.pendingReviewMinutes).toBe(0)
    expect(giorno.warnings).not.toContain('OLTRE_TURNO')
  })

  it('le ore oltre il turno rifiutate si tagliano da sole alla fine del turno', () => {
    // Il rifiuto È il taglio: nessuna correzione manuale della timbratura.
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(18, 30))],
      regolaTurno,
      makeContext({
        shiftWindows: [{ startMinutes: at(9), endMinutes: at(17) }],
        shiftReview: { overtime: 'REJECTED' },
      })
    )

    expect(giorno.workedMinutes).toBe(at(8))
    expect(giorno.pendingReviewMinutes).toBe(0)
    expect(giorno.warnings).not.toContain('OLTRE_TURNO')
  })

  it('senza turno pianificato le ore sono quelle timbrate, senza arrotondamenti', () => {
    // L'extra chiamato all'ultimo non perde nulla per un difetto di
    // pianificazione: niente finestra, niente blocchi
    const giorno = computeRecognizedDay(
      [inAt(at(8, 51)), outAt(at(17))],
      regolaTurno,
      makeContext()
    )

    expect(giorno.clockIn).toBe(at(8, 51))
    expect(giorno.workedMinutes).toBe(at(17) - at(8, 51))
    expect(giorno.warnings).not.toContain('OLTRE_TURNO')
  })

  it('il turno spezzato ha due finestre, ciascuna con le sue regole', () => {
    // Turni 7:00-13:00 e 17:00-22:00. Timbra 6:50 (anticipo tagliato) e
    // 17:06 (ritardo di 6, entro tolleranza: resta 17:06)
    const giorno = computeRecognizedDay(
      [inAt(at(6, 50)), outAt(at(13)), inAt(at(17, 6)), outAt(at(22))],
      regolaTurno,
      makeContext({
        shiftWindows: [
          { startMinutes: at(7), endMinutes: at(13) },
          { startMinutes: at(17), endMinutes: at(22) },
        ],
      })
    )

    expect(giorno.workedMinutes).toBe(at(6) + (at(22) - at(17, 6)))
  })

  it('lavoro del tutto fuori dal turno pianificato resta sospeso finché nessuno decide', () => {
    // Pianificato 7:00-13:00, timbra 15:00-18:00: nessuno sa se era lavoro
    // richiesto. Le tre ore aspettano la revisione, come quelle oltre la fine.
    const giorno = computeRecognizedDay(
      [inAt(at(15)), outAt(at(18))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(7), endMinutes: at(13) }] })
    )

    expect(giorno.workedMinutes).toBe(0)
    expect(giorno.pendingReviewMinutes).toBe(at(3))
    expect(giorno.warnings).toContain('OLTRE_TURNO')
  })

  it('lavoro fuori dal turno approvato: le ore contano', () => {
    const giorno = computeRecognizedDay(
      [inAt(at(15)), outAt(at(18))],
      regolaTurno,
      makeContext({
        shiftWindows: [{ startMinutes: at(7), endMinutes: at(13) }],
        shiftReview: { overtime: 'APPROVED' },
      })
    )

    expect(giorno.workedMinutes).toBe(at(3))
    expect(giorno.pendingReviewMinutes).toBe(0)
  })

  it("l'anticipo oltre la tolleranza si conta subito, ma in attesa di revisione", () => {
    // "Vieni alle 6:30 che arriva il fornitore", turno 7:00-13:00: la
    // mezz'ora conta da subito — l'ha chiesta il datore — ma un umano deve
    // confermarla, così nessuno si allunga il turno da solo.
    const giorno = computeRecognizedDay(
      [inAt(at(6, 30)), outAt(at(13))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(7), endMinutes: at(13) }] })
    )

    expect(giorno.clockIn).toBe(at(6, 30))
    expect(giorno.workedMinutes).toBe(at(6, 30))
    expect(giorno.warnings).toContain('ANTICIPO_TURNO')
  })

  it("l'anticipo rifiutato riparte dall'inizio del turno", () => {
    const giorno = computeRecognizedDay(
      [inAt(at(6, 30)), outAt(at(13))],
      regolaTurno,
      makeContext({
        shiftWindows: [{ startMinutes: at(7), endMinutes: at(13) }],
        shiftReview: { earlyIn: 'REJECTED' },
      })
    )

    expect(giorno.clockIn).toBe(at(7))
    expect(giorno.workedMinutes).toBe(at(6))
    expect(giorno.warnings).not.toContain('ANTICIPO_TURNO')
  })

  it("l'anticipo approvato conta senza più segnalazioni", () => {
    const giorno = computeRecognizedDay(
      [inAt(at(6, 30)), outAt(at(13))],
      regolaTurno,
      makeContext({
        shiftWindows: [{ startMinutes: at(7), endMinutes: at(13) }],
        shiftReview: { earlyIn: 'APPROVED' },
      })
    )

    expect(giorno.workedMinutes).toBe(at(6, 30))
    expect(giorno.warnings).not.toContain('ANTICIPO_TURNO')
  })

  it('il buco del turno spezzato non è lavoro, anche se nessuno ha timbrato l\'uscita', () => {
    // Pianificato 7:00-13:00 e 17:00-22:00, timbra 7:00 e 22:00 senza mai
    // uscire: contano le 11 ore dentro le finestre, non le 4 del buco.
    const giorno = computeRecognizedDay(
      [inAt(at(7)), outAt(at(22))],
      regolaTurno,
      makeContext({
        shiftWindows: [
          { startMinutes: at(7), endMinutes: at(13) },
          { startMinutes: at(17), endMinutes: at(22) },
        ],
      })
    )

    expect(giorno.workedMinutes).toBe(at(11))
    expect(giorno.pendingReviewMinutes).toBe(0)
    expect(giorno.warnings).toContain('BUCO_TURNO')
  })

  it("l'uscita molto prima della fine del turno viene segnalata", () => {
    // Turno fino alle 17:00, esce alle 15:00: ore reali, nessuna
    // approvazione richiesta, ma il responsabile deve poterlo vedere.
    const giorno = computeRecognizedDay(
      [inAt(at(9)), outAt(at(15))],
      regolaTurno,
      makeContext({ shiftWindows: [{ startMinutes: at(9), endMinutes: at(17) }] })
    )

    expect(giorno.workedMinutes).toBe(at(6))
    expect(giorno.warnings).toContain('USCITA_ANTICIPATA')
  })
})
