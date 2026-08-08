import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { romeInstant } from '@/lib/timezone'
import { GET as cartellino } from '../route'
import { GET as riepilogo } from '../riepilogo/route'
import { GET as esporta } from '../export/route'

/**
 * Il cartellino contiene le ore e quindi la retribuzione di una persona.
 * Lo staff può vedere e scaricare il proprio: il `userId` della richiesta
 * viene ignorato per chi non è admin o manager, ed è il cardine da non
 * perdere nella conversione a `withAuth`. Il riepilogo di tutto il team
 * resta invece riservato a chi le paghe le prepara.
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

const MESE = { month: 3, year: 2026 }

/**
 * Una giornata timbrata nel mese: senza almeno un record il cartellino non
 * esiste e la route risponde 404, che nasconderebbe la domanda che ci
 * interessa, cioè di chi è il cartellino che esce.
 */
async function giornataLavorata(userId: string) {
  const venue = await venueDiTest()
  // Le paghe considerano solo chi ha il portale attivo, che nel seed è spento.
  await prisma.user.update({ where: { id: userId }, data: { portalEnabled: true } })
  await prisma.attendanceRecord.createMany({
    data: [
      {
        userId,
        venueId: venue.id,
        punchType: 'IN',
        punchedAt: romeInstant('2026-03-10', 9 * 60),
      },
      {
        userId,
        venueId: venue.id,
        punchType: 'OUT',
        punchedAt: romeInstant('2026-03-10', 17 * 60),
      },
    ],
  })
}

describe('GET /api/cartellino', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(
      cartellino,
      jsonRequest('/api/cartellino', { searchParams: MESE })
    )
    expect(status).toBe(401)
  })

  it("ignora il userId della richiesta e restituisce il cartellino di chi chiede", async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    await giornataLavorata(io.user.id)
    await giornataLavorata(altro.id)

    const { status, body } = await callRoute<{ data: { userId: string } }>(
      cartellino,
      jsonRequest('/api/cartellino', { searchParams: { ...MESE, userId: altro.id } })
    )

    expect(status).toBe(200)
    expect(body.data.userId).toBe(io.user.id)
  })

  it('lascia invece a un manager il cartellino di chi indica', async () => {
    const staff = await prisma.user.findFirst({
      where: { role: { name: 'staff' } },
      orderBy: { username: 'asc' },
    })
    await giornataLavorata(staff!.id)
    await entraCome('manager')

    const { status, body } = await callRoute<{ data: { userId: string } }>(
      cartellino,
      jsonRequest('/api/cartellino', { searchParams: { ...MESE, userId: staff!.id } })
    )

    expect(status).toBe(200)
    expect(body.data.userId).toBe(staff!.id)
  })

  it('rifiuta parametri fuori intervallo', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      cartellino,
      jsonRequest('/api/cartellino', { searchParams: { month: 13, year: 2026 } })
    )

    expect(status).toBe(400)
  })
})

describe('GET /api/cartellino/riepilogo', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(
      riepilogo,
      jsonRequest('/api/cartellino/riepilogo', { searchParams: MESE })
    )
    expect(status).toBe(401)
  })

  it('resta chiuso allo staff: sono le ore di tutto il team', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      riepilogo,
      jsonRequest('/api/cartellino/riepilogo', { searchParams: MESE })
    )

    expect(status).toBe(403)
  })

  it('è aperto a un manager', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      riepilogo,
      jsonRequest('/api/cartellino/riepilogo', { searchParams: MESE })
    )

    expect(status).toBe(200)
  })
})

describe('GET /api/cartellino/export', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(
      esporta,
      jsonRequest('/api/cartellino/export', { searchParams: MESE })
    )
    expect(status).toBe(401)
  })

  it("non lascia che uno staff scarichi il cartellino di un collega", async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    await giornataLavorata(io.user.id)
    await giornataLavorata(altro.id)

    const { status, headers } = await callRoute(
      esporta,
      jsonRequest('/api/cartellino/export', { searchParams: { ...MESE, userId: altro.id } })
    )

    // Il file esce, ma è il proprio: il userId della richiesta viene ignorato.
    expect(status).toBe(200)
    const nome = headers.get('content-disposition') ?? ''
    expect(nome).toContain(io.user.lastName.toLowerCase())
    expect(nome).not.toContain(altro.lastName.toLowerCase())
  })
})
