import { describe, it, expect } from 'vitest'
import {
  puoSincronizzare,
  sincronizzazioniRimaste,
  riapertura,
  TETTO_GIORNALIERO,
  RISERVA_RITENTATIVI,
} from '../contingente'

describe('sincronizzazioniRimaste', () => {
  it('a giornata vuota ne restano tre: la quarta è la riserva', () => {
    expect(
      sincronizzazioniRimaste({
        sincronizzazioniOggi: 0,
        restantiDichiarate: null,
        riapreAlle: null,
      })
    ).toBe(TETTO_GIORNALIERO - RISERVA_RITENTATIVI)
  })

  it('ogni sincronizzazione fatta ne toglie una', () => {
    expect(
      sincronizzazioniRimaste({
        sincronizzazioniOggi: 1,
        restantiDichiarate: null,
        riapreAlle: null,
      })
    ).toBe(2)
  })

  // Il contingente è **per endpoint**: una sincronizzazione spende una chiamata
  // su `transactions` e una su `balances`, cioè una su ciascun contatore. Il
  // `remaining` dell'header è quindi già in sincronizzazioni, e dividerlo per il
  // numero di endpoint ne dimezzerebbe il valore per niente.
  it("il residuo dichiarato è già in sincronizzazioni, non in chiamate totali", () => {
    expect(
      sincronizzazioniRimaste({ sincronizzazioniOggi: 0, restantiDichiarate: 2, riapreAlle: null })
    ).toBe(2)
  })

  it("i ritentativi rientrano dall'header, non dal contatore locale", () => {
    // Due sincronizzazioni fatte: il contatore locale crede che ne resti una
    // oltre la riserva. Ma un ritentativo ha bruciato una chiamata in più sullo
    // stesso endpoint e **solo la banca lo sa**: deve vincere lo zero.
    expect(
      sincronizzazioniRimaste({ sincronizzazioniOggi: 2, restantiDichiarate: 0, riapreAlle: null })
    ).toBe(0)
  })

  it('quando la banca dichiara il residuo, vince la banca', () => {
    expect(
      sincronizzazioniRimaste({ sincronizzazioniOggi: 0, restantiDichiarate: 1, riapreAlle: null })
    ).toBe(1)
  })

  it('non scende mai sotto zero, nemmeno se il contatore locale sfora il tetto', () => {
    expect(
      sincronizzazioniRimaste({
        sincronizzazioniOggi: 99,
        restantiDichiarate: null,
        riapreAlle: null,
      })
    ).toBe(0)
  })

  it('una dichiarazione generosa non supera il tetto locale con la sua riserva', () => {
    expect(
      sincronizzazioniRimaste({ sincronizzazioniOggi: 0, restantiDichiarate: 4, riapreAlle: null })
    ).toBe(TETTO_GIORNALIERO - RISERVA_RITENTATIVI)
  })
})

describe('puoSincronizzare', () => {
  it('consente quando c’è margine', () => {
    const esito = puoSincronizzare({
      sincronizzazioniOggi: 0,
      restantiDichiarate: null,
      riapreAlle: null,
    })
    expect(esito.si).toBe(true)
    expect(esito.motivo).toBeUndefined()
  })

  it('rifiuta a contingente esaurito e dice quando si riapre', () => {
    const riapre = new Date('2026-08-16T00:00:00.000Z')
    const esito = puoSincronizzare({
      sincronizzazioniOggi: 3,
      restantiDichiarate: 0,
      riapreAlle: riapre,
    })
    expect(esito.si).toBe(false)
    expect(esito.riapreAlle).toEqual(riapre)
    expect(esito.motivo).toBeTruthy()
  })

  it('rifiuta anche senza sapere quando si riapre, e non finge di saperlo', () => {
    const esito = puoSincronizzare({
      sincronizzazioniOggi: 3,
      restantiDichiarate: null,
      riapreAlle: null,
    })
    expect(esito.si).toBe(false)
    expect(esito.riapreAlle).toBeNull()
    expect(esito.motivo).toBeTruthy()
  })
})

describe('riapertura', () => {
  it('converte la durata dichiarata dalla banca in un istante', () => {
    const adesso = new Date('2026-08-15T22:00:00.000Z')
    expect(riapertura(7200, adesso)).toEqual(new Date('2026-08-16T00:00:00.000Z'))
  })

  it('senza durata non inventa un istante', () => {
    expect(riapertura(null, new Date('2026-08-15T22:00:00.000Z'))).toBeNull()
  })
})

describe('le costanti', () => {
  it('il tetto della banca è quattro per endpoint e per conto', () => {
    expect(TETTO_GIORNALIERO).toBe(4)
  })

  it('una sincronizzazione resta di riserva ai ritentativi', () => {
    expect(RISERVA_RITENTATIVI).toBe(1)
  })
})
