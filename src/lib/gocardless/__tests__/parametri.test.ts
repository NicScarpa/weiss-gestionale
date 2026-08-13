/**
 * L'URL di ritorno è l'unico parametro del collegamento che non si vede
 * finché non si sbaglia: la banca lo accetta qualunque cosa contenga, e il
 * difetto compare solo alla fine dell'autenticazione, quando l'utente è già
 * passato per l'OTP e il browser atterra da nessuna parte.
 *
 * È successo davvero il 13 agosto 2026: in produzione mancava `APP_URL`, il
 * fallback silenzioso mandava a `http://localhost:3000` e il consenso —
 * concesso, valido, registrato in GoCardless — sembrava perso.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { urlDiRitorno, giorni } from '../parametri'
import { ConfigurazioneMancante } from '../errori'

describe('urlDiRitorno', () => {
  // Come in `servizio.test.ts`: l'ambiente si salva e si rimette a posto, se
  // no i test successivi ereditano le variabili di questo file.
  let ambientePrecedente: NodeJS.ProcessEnv

  beforeEach(() => {
    ambientePrecedente = { ...process.env }
    delete process.env.GOCARDLESS_REDIRECT_URI
    delete process.env.APP_URL
    delete process.env.NEXTAUTH_URL
  })

  afterEach(() => {
    process.env = ambientePrecedente
  })

  it('usa GOCARDLESS_REDIRECT_URI così com è, se c è', () => {
    process.env.GOCARDLESS_REDIRECT_URI = 'https://esempio.it/altrove'
    process.env.APP_URL = 'https://gestionale.esempio.it'

    expect(urlDiRitorno()).toBe('https://esempio.it/altrove')
  })

  it('deriva il callback da APP_URL', () => {
    process.env.APP_URL = 'https://gestionale.esempio.it'

    expect(urlDiRitorno()).toBe('https://gestionale.esempio.it/api/gocardless/callback')
  })

  it('non raddoppia la barra se APP_URL finisce con una', () => {
    process.env.APP_URL = 'https://gestionale.esempio.it/'

    expect(urlDiRitorno()).toBe('https://gestionale.esempio.it/api/gocardless/callback')
  })

  it('ripiega su NEXTAUTH_URL quando APP_URL non è impostata', () => {
    process.env.NEXTAUTH_URL = 'https://gestionale.esempio.it'

    expect(urlDiRitorno()).toBe('https://gestionale.esempio.it/api/gocardless/callback')
  })

  it('in produzione, senza nessuna delle tre variabili, protesta invece di ripiegare su localhost', () => {
    expect.assertions(2)
    try {
      urlDiRitorno('production')
    } catch (errore) {
      expect(errore).toBeInstanceOf(ConfigurazioneMancante)
      expect((errore as Error).message).toContain('APP_URL')
    }
  })

  it('fuori dalla produzione, senza variabili, resta localhost', () => {
    expect(urlDiRitorno('development')).toBe('http://localhost:3000/api/gocardless/callback')
  })
})

describe('giorni', () => {
  it('legge un numero scritto come stringa', () => {
    expect(giorni('180', 90)).toBe(180)
  })

  it('accetta anche un numero vero', () => {
    expect(giorni(180, 90)).toBe(180)
  })

  it('torna al difetto se il valore manca o non si legge', () => {
    expect(giorni(undefined, 90)).toBe(90)
    expect(giorni('non un numero', 90)).toBe(90)
    expect(giorni(null, 90)).toBe(90)
  })
})
