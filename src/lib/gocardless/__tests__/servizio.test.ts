import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clientDaAmbiente, impostaClientPerTest } from '../servizio'
import { ConfigurazioneMancante } from '../errori'

describe('clientDaAmbiente', () => {
  // Si salva e ripristina l'ambiente a ogni test: mutarlo senza rimetterlo a
  // posto avvelenerebbe i test successivi, in questo file e altrove.
  let ambientePrecedente: NodeJS.ProcessEnv

  beforeEach(() => {
    impostaClientPerTest(null)
    ambientePrecedente = { ...process.env }
    delete process.env.GOCARDLESS_SECRET_ID
    delete process.env.GOCARDLESS_SECRET_KEY
  })

  afterEach(() => {
    process.env = ambientePrecedente
  })

  it('lancia ConfigurazioneMancante se le chiavi non sono impostate', () => {
    expect(() => clientDaAmbiente()).toThrow(ConfigurazioneMancante)
  })

  it('il messaggio nomina le variabili mancanti ma non contiene alcun valore', () => {
    expect.assertions(3)
    try {
      clientDaAmbiente()
    } catch (errore) {
      expect(errore).toBeInstanceOf(ConfigurazioneMancante)
      const messaggio = (errore as Error).message
      expect(messaggio).toContain('GOCARDLESS_SECRET_ID')
      expect(messaggio).toContain('GOCARDLESS_SECRET_KEY')
    }
  })
})
