import { describe, it, expect } from 'vitest'
import { calcolaDataDa, GIORNI_MASSIMI_STORICO } from '../finestra'

const OGGI = new Date('2026-08-15T09:00:00.000Z')

describe('calcolaDataDa', () => {
  it('primo giro senza nulla: risale di 90 giorni', () => {
    expect(calcolaDataDa({ syncCutoffDate: null, ultimoMovimento: null }, OGGI)).toBe('2026-05-17')
  })

  it("riparte dall'ultimo movimento noto, incluso", () => {
    expect(
      calcolaDataDa(
        { syncCutoffDate: null, ultimoMovimento: new Date('2026-08-12T00:00:00.000Z') },
        OGGI
      )
    ).toBe('2026-08-12')
  })

  it("la data di taglio vince sull'ultimo movimento se è più recente", () => {
    expect(
      calcolaDataDa(
        {
          syncCutoffDate: new Date('2026-08-01T00:00:00.000Z'),
          ultimoMovimento: new Date('2026-07-20T00:00:00.000Z'),
        },
        OGGI
      )
    ).toBe('2026-08-01')
  })

  it('la data di taglio è un pavimento, non una scelta: non arretra mai', () => {
    expect(
      calcolaDataDa(
        {
          syncCutoffDate: new Date('2026-06-01T00:00:00.000Z'),
          ultimoMovimento: new Date('2026-08-12T00:00:00.000Z'),
        },
        OGGI
      )
    ).toBe('2026-08-12')
  })

  it('non chiede mai oltre i 90 giorni, nemmeno con una data di taglio più vecchia', () => {
    expect(
      calcolaDataDa(
        { syncCutoffDate: new Date('2020-01-01T00:00:00.000Z'), ultimoMovimento: null },
        OGGI
      )
    ).toBe('2026-05-17')
  })

  // L'ora di `oggi` non deve spostare il giorno calcolato: il cron gira di
  // notte, e con il costruttore locale al posto di quello UTC un giro all'una
  // italiana cadrebbe nel giorno prima da fine marzo a fine ottobre.
  it("l'ora del giorno non sposta il risultato", () => {
    const notte = new Date('2026-08-15T01:30:00.000Z')
    const sera = new Date('2026-08-15T23:45:00.000Z')
    const stato = { syncCutoffDate: null, ultimoMovimento: null }
    expect(calcolaDataDa(stato, notte)).toBe(calcolaDataDa(stato, sera))
  })

  it(`GIORNI_MASSIMI_STORICO è ${GIORNI_MASSIMI_STORICO}`, () => {
    expect(GIORNI_MASSIMI_STORICO).toBe(90)
  })
})
