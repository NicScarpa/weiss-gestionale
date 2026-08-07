import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { GET as previsione } from '../route'

/**
 * La previsione di cassa a 30 giorni espone saldi correnti e proiettati: è il
 * quadro finanziario dell'azienda, riservato ad admin e manager (finding A2-05).
 * Lo staff non raggiunge la dashboard — il layout lo rimanda al portale — ma
 * l'endpoint restava chiamabile direttamente.
 */
setupIntegrationDb()

/** Vedi la nota in categorization-rules: gli utenti del seed nascono con `mustChangePassword`. */
async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

describe('GET /api/dashboard/forecast', () => {
  it('nega la previsione di cassa a uno staff', async () => {
    await entraCome('staff')

    const { status } = await callRoute(previsione, jsonRequest('/api/dashboard/forecast'))

    expect(status).toBe(403)
  })

  it('la concede a un manager', async () => {
    await entraCome('manager')

    const { status, body } = await callRoute<{ currentBalance: { total: number } }>(
      previsione,
      jsonRequest('/api/dashboard/forecast', { searchParams: { days: 7 } })
    )

    expect(status).toBe(200)
    expect(body.currentBalance).toBeDefined()
  })

  it('risponde 401 a chi non è autenticato', async () => {
    const { status } = await callRoute(previsione, jsonRequest('/api/dashboard/forecast'))

    expect(status).toBe(401)
  })
})
