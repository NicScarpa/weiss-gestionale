import { describe, it, expect } from 'vitest'

import { classificaRisposta } from '../sync'
import { MAX_TENTATIVI_INVIO } from '../db'

/**
 * La politica dei tentativi decide che fine fa il conteggio di una serata:
 * ritentare per sempre un rifiuto tiene occupata la coda senza speranza,
 * smettere troppo presto lascia sul dispositivo un lavoro che sarebbe passato
 * al secondo tentativo. Sta in una funzione pura per poterla leggere qui.
 */
describe('classificaRisposta', () => {
  it('una chiusura accettata è consegnata e esce dalla coda', () => {
    expect(classificaRisposta(200)).toBe('consegnata')
    expect(classificaRisposta(201)).toBe('consegnata')
  })

  it('un guasto del server si riprova: la chiusura non c’entra niente', () => {
    expect(classificaRisposta(500)).toBe('riprova')
    expect(classificaRisposta(502)).toBe('riprova')
  })

  it('sessione scaduta, timeout e troppe richieste si riprovano', () => {
    // Sono giudizi sul momento, non sul contenuto: se cancellassero la
    // chiusura, una sessione scaduta basterebbe a perdere una serata.
    expect(classificaRisposta(401)).toBe('riprova')
    expect(classificaRisposta(408)).toBe('riprova')
    expect(classificaRisposta(429)).toBe('riprova')
  })

  it('un rifiuto nel merito è definitivo: fra un’ora sarebbe uguale', () => {
    // Definitivo significa «smetti di ritentare», non «butta via»: la riga
    // resta in coda con il motivo scritto sopra.
    expect(classificaRisposta(400)).toBe('definitivo')
    expect(classificaRisposta(403)).toBe('definitivo')
    expect(classificaRisposta(409)).toBe('definitivo')
  })
})

describe('limite dei tentativi', () => {
  it('è un numero piccolo ma maggiore di uno', () => {
    // Uno solo trasformerebbe un singolo scatto di rete in una resa.
    expect(MAX_TENTATIVI_INVIO).toBeGreaterThan(1)
    expect(MAX_TENTATIVI_INVIO).toBeLessThanOrEqual(10)
  })
})
