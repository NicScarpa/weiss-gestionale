import { describe, it, expect } from 'vitest'
import { generaPasswordTemporanea } from '../password-temporanea'
import { passwordSchema } from '../validations/password'

describe('generaPasswordTemporanea', () => {
  it('produce password conformi alla policy dell\'applicazione', () => {
    // Su 200 estrazioni casuali nessuna deve violare lo schema: se la classe
    // garantita saltasse, l'utente riceverebbe una password che il form di
    // cambio password rifiuterebbe.
    for (let i = 0; i < 200; i++) {
      const risultato = passwordSchema.safeParse(generaPasswordTemporanea())
      expect(risultato.success).toBe(true)
    }
  })

  it('esclude i caratteri ambigui da leggere e dettare', () => {
    for (let i = 0; i < 200; i++) {
      expect(generaPasswordTemporanea()).not.toMatch(/[O0lI1]/)
    }
  })

  it('non ripete la stessa password', () => {
    const generate = new Set(Array.from({ length: 500 }, generaPasswordTemporanea))
    expect(generate.size).toBe(500)
  })

  it('non colloca sempre le classi nello stesso ordine', () => {
    // Senza mescolamento la prima posizione sarebbe sempre una maiuscola.
    const primeLettere = new Set(
      Array.from({ length: 100 }, () => generaPasswordTemporanea()[0])
    )
    expect(primeLettere.size).toBeGreaterThan(1)
    expect(Array.from(primeLettere).some((c) => !/[A-Z]/.test(c))).toBe(true)
  })
})
