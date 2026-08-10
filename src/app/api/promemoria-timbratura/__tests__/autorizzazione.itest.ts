import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as elenco, POST as crea } from '../route'
import { PUT as modifica, DELETE as elimina } from '../[id]/route'

/**
 * I promemoria di timbratura mandano notifiche a tutto l'organico: chi li
 * configura scrive sui telefoni dei colleghi. Restano ad admin e manager.
 */
setupIntegrationDb()

const PROMEMORIA = {
  name: 'Apertura',
  punchType: 'IN' as const,
  timeMinutes: 8 * 60 + 55,
  daysOfWeek: [1, 2, 3, 4, 5],
  title: 'Ricordati di timbrare',
  body: 'Il turno sta per cominciare',
}

async function promemoriaDiTest() {
  const venue = await venueDiTest()
  return prisma.clockReminder.create({
    data: {
      venueId: venue.id,
      name: PROMEMORIA.name,
      punchType: 'IN',
      timeMinutes: PROMEMORIA.timeMinutes,
      daysOfWeek: PROMEMORIA.daysOfWeek,
      title: PROMEMORIA.title,
      body: PROMEMORIA.body,
    },
  })
}

describe('/api/promemoria-timbratura', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(elenco, jsonRequest('/api/promemoria-timbratura'))
    expect(status).toBe(401)
  })

  it("nega a uno staff l'elenco dei promemoria", async () => {
    await entraCome('staff')
    const { status } = await callRoute(elenco, jsonRequest('/api/promemoria-timbratura'))
    expect(status).toBe(403)
  })

  it('lo concede a un manager', async () => {
    await promemoriaDiTest()
    await entraCome('manager')

    const { status, body } = await callRoute<{ data: unknown[] }>(
      elenco,
      jsonRequest('/api/promemoria-timbratura')
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  it('impedisce a uno staff di creare un promemoria', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      crea,
      jsonRequest('/api/promemoria-timbratura', { method: 'POST', body: PROMEMORIA })
    )

    expect(status).toBe(403)
    expect(await prisma.clockReminder.count()).toBe(0)
  })

  it('lo consente a un manager', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      crea,
      jsonRequest('/api/promemoria-timbratura', { method: 'POST', body: PROMEMORIA })
    )

    expect(status).toBe(201)
    expect(await prisma.clockReminder.count()).toBe(1)
  })
})

describe('/api/promemoria-timbratura/[id]', () => {
  it('impedisce a uno staff di modificare un promemoria', async () => {
    const promemoria = await promemoriaDiTest()
    await entraCome('staff')

    const { status } = await callRoute(
      modifica,
      jsonRequest(`/api/promemoria-timbratura/${promemoria.id}`, {
        method: 'PUT',
        body: { ...PROMEMORIA, name: 'Rinominato' },
      }),
      { id: promemoria.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.clockReminder.findUnique({ where: { id: promemoria.id } })
    expect(dopo?.name).toBe('Apertura')
  })

  it('impedisce a uno staff di eliminare un promemoria', async () => {
    const promemoria = await promemoriaDiTest()
    await entraCome('staff')

    const { status } = await callRoute(
      elimina,
      jsonRequest(`/api/promemoria-timbratura/${promemoria.id}`, { method: 'DELETE' }),
      { id: promemoria.id }
    )

    expect(status).toBe(403)
    expect(await prisma.clockReminder.count()).toBe(1)
  })

  it('lascia eliminare a un manager', async () => {
    const promemoria = await promemoriaDiTest()
    await entraCome('manager')

    const { status } = await callRoute(
      elimina,
      jsonRequest(`/api/promemoria-timbratura/${promemoria.id}`, { method: 'DELETE' }),
      { id: promemoria.id }
    )

    expect(status).toBe(200)
    expect(await prisma.clockReminder.count()).toBe(0)
  })
})
