import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as elenco, POST as crea } from '../route'
import { PUT as modifica, DELETE as elimina } from '../[id]/route'
import { POST as assegna, DELETE as revoca } from '../[id]/assegnazioni/route'

/**
 * I luoghi di lavoro decidono dove si può timbrare e con quale regola oraria:
 * cambiarli cambia le ore pagate. Restano ad admin e manager, prima e dopo la
 * conversione a `withAuth`.
 */
setupIntegrationDb()

async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

async function luogoDiTest() {
  const venue = await venueDiTest()
  return prisma.workLocation.create({
    data: { venueId: venue.id, name: 'Magazzino', geofenceRadiusMeters: 100 },
  })
}

const LUOGO_NUOVO = { name: 'Sede distaccata', geofenceRadiusMeters: 150 }

describe('/api/luoghi-lavoro', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(elenco, jsonRequest('/api/luoghi-lavoro'))
    expect(status).toBe(401)
  })

  it("nega a uno staff l'elenco dei luoghi", async () => {
    await entraCome('staff')
    const { status } = await callRoute(elenco, jsonRequest('/api/luoghi-lavoro'))
    expect(status).toBe(403)
  })

  it('lo concede a un manager', async () => {
    await luogoDiTest()
    await entraCome('manager')

    const { status, body } = await callRoute<{ data: unknown[] }>(
      elenco,
      jsonRequest('/api/luoghi-lavoro')
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  it('impedisce a uno staff di creare un luogo', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      crea,
      jsonRequest('/api/luoghi-lavoro', { method: 'POST', body: LUOGO_NUOVO })
    )

    expect(status).toBe(403)
    expect(await prisma.workLocation.count()).toBe(0)
  })

  it('lo consente a un manager', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      crea,
      jsonRequest('/api/luoghi-lavoro', { method: 'POST', body: LUOGO_NUOVO })
    )

    expect(status).toBe(201)
    expect(await prisma.workLocation.count()).toBe(1)
  })
})

describe('/api/luoghi-lavoro/[id]', () => {
  it('impedisce a uno staff di modificare un luogo', async () => {
    const luogo = await luogoDiTest()
    await entraCome('staff')

    const { status } = await callRoute(
      modifica,
      jsonRequest(`/api/luoghi-lavoro/${luogo.id}`, {
        method: 'PUT',
        body: { ...LUOGO_NUOVO, name: 'Rinominato' },
      }),
      { id: luogo.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.workLocation.findUnique({ where: { id: luogo.id } })
    expect(dopo?.name).toBe('Magazzino')
  })

  it('impedisce a uno staff di eliminare un luogo', async () => {
    const luogo = await luogoDiTest()
    await entraCome('staff')

    const { status } = await callRoute(
      elimina,
      jsonRequest(`/api/luoghi-lavoro/${luogo.id}`, { method: 'DELETE' }),
      { id: luogo.id }
    )

    expect(status).toBe(403)
    expect(await prisma.workLocation.count()).toBe(1)
  })

  it('lascia eliminare a un manager', async () => {
    const luogo = await luogoDiTest()
    await entraCome('manager')

    const { status } = await callRoute(
      elimina,
      jsonRequest(`/api/luoghi-lavoro/${luogo.id}`, { method: 'DELETE' }),
      { id: luogo.id }
    )

    expect(status).toBe(200)
    expect(await prisma.workLocation.count()).toBe(0)
  })
})

describe('/api/luoghi-lavoro/[id]/assegnazioni', () => {
  it('impedisce a uno staff di abilitarsi su un luogo', async () => {
    const luogo = await luogoDiTest()
    const io = await entraCome('staff')

    const { status } = await callRoute(
      assegna,
      jsonRequest(`/api/luoghi-lavoro/${luogo.id}/assegnazioni`, {
        method: 'POST',
        body: { userId: io.user.id, trackingMode: 'GPS_GEOFENCE' },
      }),
      { id: luogo.id }
    )

    expect(status).toBe(403)
    expect(await prisma.workLocationAssignment.count()).toBe(0)
  })

  it('lo consente a un manager', async () => {
    const luogo = await luogoDiTest()
    const staff = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    await entraCome('manager')

    const { status } = await callRoute(
      assegna,
      jsonRequest(`/api/luoghi-lavoro/${luogo.id}/assegnazioni`, {
        method: 'POST',
        body: { userId: staff!.id, trackingMode: 'GPS_GEOFENCE' },
      }),
      { id: luogo.id }
    )

    expect(status).toBe(201)
  })

  it('impedisce a uno staff di revocare un abilitato', async () => {
    const luogo = await luogoDiTest()
    const staff = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    await prisma.workLocationAssignment.create({
      data: { userId: staff!.id, workLocationId: luogo.id, trackingMode: 'GPS_GEOFENCE' },
    })
    await entraCome('staff')

    const { status } = await callRoute(
      revoca,
      jsonRequest(`/api/luoghi-lavoro/${luogo.id}/assegnazioni`, {
        method: 'DELETE',
        searchParams: { userId: staff!.id },
      }),
      { id: luogo.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.workLocationAssignment.findFirst()
    expect(dopo?.endedAt).toBeNull()
  })
})
