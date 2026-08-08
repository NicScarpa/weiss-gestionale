import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as elenco, POST as crea } from '../route'
import { PUT as modifica, DELETE as elimina } from '../[id]/route'
import { POST as provaCalcolo } from '../prova-calcolo/route'

/**
 * Le regole orario sono il motore che trasforma le timbrature in ore pagate:
 * chi le modifica modifica gli stipendi di tutti. Restano ad admin e manager.
 */
setupIntegrationDb()

async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

const REGOLA = {
  name: 'Standard',
  dayStartMinutes: 8 * 60,
  dayEndMinutes: 18 * 60,
}

async function regolaDiTest() {
  const venue = await venueDiTest()
  return prisma.timekeepingPolicy.create({
    data: {
      venueId: venue.id,
      name: 'Standard',
      dayStartMinutes: 8 * 60,
      dayEndMinutes: 18 * 60,
    },
  })
}

describe('/api/politiche-orario', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(elenco, jsonRequest('/api/politiche-orario'))
    expect(status).toBe(401)
  })

  it("nega a uno staff l'elenco delle regole", async () => {
    await entraCome('staff')
    const { status } = await callRoute(elenco, jsonRequest('/api/politiche-orario'))
    expect(status).toBe(403)
  })

  it('lo concede a un manager', async () => {
    await regolaDiTest()
    await entraCome('manager')

    const { status, body } = await callRoute<{ data: unknown[] }>(
      elenco,
      jsonRequest('/api/politiche-orario')
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  it('impedisce a uno staff di creare una regola', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      crea,
      jsonRequest('/api/politiche-orario', { method: 'POST', body: REGOLA })
    )

    expect(status).toBe(403)
    expect(await prisma.timekeepingPolicy.count()).toBe(0)
  })

  it('lo consente a un manager', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      crea,
      jsonRequest('/api/politiche-orario', { method: 'POST', body: REGOLA })
    )

    expect(status).toBe(201)
    expect(await prisma.timekeepingPolicy.count()).toBe(1)
  })
})

describe('/api/politiche-orario/[id]', () => {
  it('impedisce a uno staff di modificare una regola', async () => {
    const regola = await regolaDiTest()
    await entraCome('staff')

    const { status } = await callRoute(
      modifica,
      jsonRequest(`/api/politiche-orario/${regola.id}`, {
        method: 'PUT',
        body: { ...REGOLA, name: 'Rinominata' },
      }),
      { id: regola.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.timekeepingPolicy.findUnique({ where: { id: regola.id } })
    expect(dopo?.name).toBe('Standard')
  })

  it('impedisce a uno staff di eliminare una regola', async () => {
    const regola = await regolaDiTest()
    await entraCome('staff')

    const { status } = await callRoute(
      elimina,
      jsonRequest(`/api/politiche-orario/${regola.id}`, { method: 'DELETE' }),
      { id: regola.id }
    )

    expect(status).toBe(403)
    expect(await prisma.timekeepingPolicy.count()).toBe(1)
  })
})

describe('/api/politiche-orario/prova-calcolo', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(
      provaCalcolo,
      jsonRequest('/api/politiche-orario/prova-calcolo', { method: 'POST', body: {} })
    )
    expect(status).toBe(401)
  })

  it('resta chiusa allo staff', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      provaCalcolo,
      jsonRequest('/api/politiche-orario/prova-calcolo', { method: 'POST', body: {} })
    )

    expect(status).toBe(403)
  })
})
