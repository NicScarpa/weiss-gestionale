import { describe, it, expect } from 'vitest'
import { normalizzaUsernameScelto, usernameValido } from '../username'

/**
 * Chi crea un utente può correggere lo username proposto: `rossi.mario2` non si
 * dice a voce volentieri, e nei casi veri chi conosce le persone sa scegliere
 * meglio di una regola. Ma un campo aperto accetta anche `Mario Rossi ` o
 * `../admin`, e quello che entra qui diventa la chiave con cui si accede.
 */

describe('normalizzaUsernameScelto', () => {
  it('toglie gli spazi ai bordi e porta al minuscolo', () => {
    expect(normalizzaUsernameScelto('  Rossi.Mario  ')).toBe('rossi.mario')
  })

  it('non inventa niente su quello che sta in mezzo', () => {
    // Normalizzare troppo (togliere spazi interni, sostituire caratteri) darebbe
    // all'utente uno username diverso da quello che ha scritto senza dirglielo:
    // meglio rifiutarlo e lasciarglielo correggere.
    expect(normalizzaUsernameScelto('mario rossi')).toBe('mario rossi')
  })
})

describe('usernameValido', () => {
  it('accetta la forma che il sistema genera', () => {
    expect(usernameValido('rossi.mario')).toBe(true)
    expect(usernameValido('rossi.mario2')).toBe(true)
    expect(usernameValido('deandre.nicolo')).toBe(true)
  })

  it('accetta anche una forma scelta a mano, purché semplice', () => {
    expect(usernameValido('mrossi')).toBe(true)
    expect(usernameValido('rossi.mario.sala')).toBe(true)
  })

  it('rifiuta spazi e maiuscole', () => {
    expect(usernameValido('mario rossi')).toBe(false)
    expect(usernameValido('Rossi.Mario')).toBe(false)
  })

  it('rifiuta i caratteri che non si dettano a voce', () => {
    expect(usernameValido('rossi/mario')).toBe(false)
    expect(usernameValido('../admin')).toBe(false)
    expect(usernameValido('rossi@mario')).toBe(false)
    expect(usernameValido('rossi_mario')).toBe(false)
  })

  it('rifiuta i punti fuori posto', () => {
    expect(usernameValido('.rossi')).toBe(false)
    expect(usernameValido('rossi.')).toBe(false)
    expect(usernameValido('rossi..mario')).toBe(false)
  })

  it('rifiuta quello troppo corto e quello smisurato', () => {
    expect(usernameValido('ab')).toBe(false)
    expect(usernameValido('abc')).toBe(true)
    expect(usernameValido('a'.repeat(41))).toBe(false)
  })

  it('rifiuta il vuoto', () => {
    expect(usernameValido('')).toBe(false)
    expect(usernameValido('   ')).toBe(false)
  })
})
