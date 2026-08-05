import { describe, it, expect } from 'vitest'
import { valutaPromemoria, RITARDO_MASSIMO_MINUTI } from '../promemoria-timbratura'

/**
 * I test girano in UTC come il server di produzione: un promemoria delle 09:00
 * italiane deve partire alle 07:00 UTC d'estate e alle 08:00 d'inverno. Su una
 * macchina italiana un confronto sbagliato passerebbe inosservato.
 */

/** Promemoria di prova: tutti i giorni, alle 09:00 italiane, mai inviato. */
function promemoria(modifiche: Partial<Parameters<typeof valutaPromemoria>[0]> = {}) {
  return {
    timeMinutes: 9 * 60,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    lastSentDate: null,
    ...modifiche,
  }
}

describe('valutaPromemoria', () => {
  it("d'estate le 09:00 italiane sono le 07:00 UTC", () => {
    expect(valutaPromemoria(promemoria(), new Date('2026-08-05T06:50:00Z'))).toBe(
      'NON_ANCORA'
    )
    expect(valutaPromemoria(promemoria(), new Date('2026-08-05T07:05:00Z'))).toBe(
      'DA_INVIARE'
    )
  })

  it("d'inverno le stesse 09:00 italiane sono le 08:00 UTC", () => {
    expect(valutaPromemoria(promemoria(), new Date('2026-01-14T07:50:00Z'))).toBe(
      'NON_ANCORA'
    )
    expect(valutaPromemoria(promemoria(), new Date('2026-01-14T08:05:00Z'))).toBe(
      'DA_INVIARE'
    )
  })

  it('nei giorni non previsti non parte', () => {
    // 5 agosto 2026 è un mercoledì (3).
    const soloWeekend = promemoria({ daysOfWeek: [0, 6] })

    expect(valutaPromemoria(soloWeekend, new Date('2026-08-05T07:05:00Z'))).toBe(
      'GIORNO_ESCLUSO'
    )
  })

  it('non parte due volte nella stessa giornata italiana', () => {
    const giaInviato = promemoria({ lastSentDate: new Date('2026-08-05T00:00:00Z') })

    expect(valutaPromemoria(giaInviato, new Date('2026-08-05T07:05:00Z'))).toBe(
      'GIA_INVIATO'
    )
  })

  it("l'invio di ieri non blocca quello di oggi", () => {
    const inviatoIeri = promemoria({ lastSentDate: new Date('2026-08-04T00:00:00Z') })

    expect(valutaPromemoria(inviatoIeri, new Date('2026-08-05T07:05:00Z'))).toBe(
      'DA_INVIARE'
    )
  })

  it('la sera tardi il promemoria del mattino non parte più', () => {
    const tardi = new Date(
      new Date('2026-08-05T07:00:00Z').getTime() +
        (RITARDO_MASSIMO_MINUTI + 1) * 60 * 1000
    )

    expect(valutaPromemoria(promemoria(), tardi)).toBe('TROPPO_TARDI')
  })

  it('un promemoria a mezzanotte italiana vale per la giornata che comincia', () => {
    // Mezzanotte italiana del 5 agosto = 22:00 UTC del 4.
    const mezzanotte = promemoria({ timeMinutes: 0 })

    expect(valutaPromemoria(mezzanotte, new Date('2026-08-04T22:05:00Z'))).toBe(
      'DA_INVIARE'
    )
  })
})
