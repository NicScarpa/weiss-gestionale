import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as elenco } from '../route'
import { DELETE as annulla } from '../[id]/route'
import { POST as approva } from '../[id]/approva/route'
import { POST as rifiuta } from '../[id]/rifiuta/route'

/**
 * Una correzione approvata riscrive le timbrature e quindi le ore pagate:
 * chiederla spetta al dipendente, deciderla a chi rivede. Il dipendente vede
 * solo le proprie richieste e può annullare solo le proprie.
 */
setupIntegrationDb()

async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

async function unAltroStaff(escluso: string) {
  const user = await prisma.user.findFirst({
    where: { role: { name: 'staff' }, isActive: true, id: { not: escluso } },
    orderBy: { username: 'asc' },
  })
  if (!user) throw new Error('Serve un secondo utente staff nel seed.')
  return user
}

async function richiesta(userId: string) {
  const venue = await venueDiTest()
  return prisma.attendanceCorrectionRequest.create({
    data: {
      userId,
      venueId: venue.id,
      date: new Date('2026-03-15'),
      reason: 'Ho dimenticato di timbrare l\'uscita',
      status: 'PENDING',
    },
  })
}

describe('GET /api/richieste-correzione', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(elenco, jsonRequest('/api/richieste-correzione'))
    expect(status).toBe(401)
  })

  it('a uno staff mostra soltanto le proprie', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    await richiesta(io.user.id)
    await richiesta(altro.id)

    const { status, body } = await callRoute<{ data: { user: { id: string } }[] }>(
      elenco,
      jsonRequest('/api/richieste-correzione')
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  it('a un manager mostra quelle di tutti', async () => {
    const staff = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    const altro = await unAltroStaff(staff!.id)
    await richiesta(staff!.id)
    await richiesta(altro.id)
    await entraCome('manager')

    const { status, body } = await callRoute<{ data: unknown[] }>(
      elenco,
      jsonRequest('/api/richieste-correzione')
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(2)
  })
})

describe('DELETE /api/richieste-correzione/[id]', () => {
  it('non lascia annullare la richiesta di un collega', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    const sua = await richiesta(altro.id)

    const { status } = await callRoute(
      annulla,
      jsonRequest(`/api/richieste-correzione/${sua.id}`, { method: 'DELETE' }),
      { id: sua.id }
    )

    // La richiesta di un altro semplicemente non esiste, per chi chiede.
    expect(status).toBe(404)
    const dopo = await prisma.attendanceCorrectionRequest.findUnique({
      where: { id: sua.id },
    })
    expect(dopo?.status).toBe('PENDING')
  })
})

describe('approvazione e rifiuto', () => {
  it('impedisce a uno staff di approvarsi la correzione', async () => {
    const io = await entraCome('staff')
    const mia = await richiesta(io.user.id)

    const { status } = await callRoute(
      approva,
      jsonRequest(`/api/richieste-correzione/${mia.id}/approva`, {
        method: 'POST',
        body: {},
      }),
      { id: mia.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.attendanceCorrectionRequest.findUnique({
      where: { id: mia.id },
    })
    expect(dopo?.status).toBe('PENDING')
  })

  it('impedisce a uno staff di rifiutarla', async () => {
    const io = await entraCome('staff')
    const mia = await richiesta(io.user.id)

    const { status } = await callRoute(
      rifiuta,
      jsonRequest(`/api/richieste-correzione/${mia.id}/rifiuta`, {
        method: 'POST',
        body: { reviewNotes: 'no' },
      }),
      { id: mia.id }
    )

    expect(status).toBe(403)
  })

  it('lascia rifiutare a un manager', async () => {
    const staff = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    const sua = await richiesta(staff!.id)
    await entraCome('manager')

    const { status } = await callRoute(
      rifiuta,
      jsonRequest(`/api/richieste-correzione/${sua.id}/rifiuta`, {
        method: 'POST',
        body: { reviewNotes: 'Le timbrature risultano corrette' },
      }),
      { id: sua.id }
    )

    expect(status).toBe(200)
    const dopo = await prisma.attendanceCorrectionRequest.findUnique({
      where: { id: sua.id },
    })
    expect(dopo?.status).toBe('REJECTED')
  })
})
