import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaChiusura } from '@/test/integration/fixtures/closures'
import { GET as suggerimenti } from '../route'

/**
 * L'audit elencava questa route fra quelle da riservare ad admin e manager, ma
 * il campo "Pagato a" delle uscite di cassa la interroga mentre lo staff compila
 * la chiusura di fine turno: chiuderla romperebbe il flusso previsto dal
 * prodotto. Resta invece da chiudere la sede presa dalla query string, che
 * permetteva di interrogare i beneficiari di una sede qualunque.
 */
setupIntegrationDb()

/** Vedi la nota in categorization-rules: gli utenti del seed nascono con `mustChangePassword`. */
async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

interface Suggerimenti {
  suggestions: { name: string; source: string }[]
}

describe('GET /api/payee-suggestions', () => {
  it('resta accessibile allo staff che compila la chiusura di cassa', async () => {
    await prisma.supplier.create({ data: { name: 'Panificio Rossi', isActive: true } })
    await entraCome('staff')

    const { status, body } = await callRoute<Suggerimenti>(
      suggerimenti,
      jsonRequest('/api/payee-suggestions', { searchParams: { q: 'pani' } })
    )

    expect(status).toBe(200)
    expect(body.suggestions.map((s) => s.name)).toContain('Panificio Rossi')
  })

  it('ignora la sede indicata nella query string', async () => {
    await creaChiusura({ uscite: [{ payee: 'Panificio Storico', amount: 20 }] })
    await entraCome('staff')

    const { status, body } = await callRoute<Suggerimenti>(
      suggerimenti,
      jsonRequest('/api/payee-suggestions', {
        searchParams: { q: 'pani', venueId: 'sede-di-un-altro' },
      })
    )

    expect(status).toBe(200)
    expect(body.suggestions.map((s) => s.name)).toContain('Panificio Storico')
  })

  it('risponde 401 a chi non è autenticato', async () => {
    const { status } = await callRoute(
      suggerimenti,
      jsonRequest('/api/payee-suggestions', { searchParams: { q: 'pani' } })
    )

    expect(status).toBe(401)
  })
})
