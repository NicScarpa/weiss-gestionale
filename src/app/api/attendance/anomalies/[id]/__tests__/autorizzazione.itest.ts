import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, loginAsUser, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as dettaglioAnomalia, PUT as risolviAnomalia } from '../route'

/**
 * Il dettaglio di un'anomalia non è un dato di servizio: espone email, GPS e
 * modello di telefono della persona segnalata. La PUT sulla stessa route il
 * controllo di ruolo ce l'ha da sempre; la GET era stata dimenticata, e finché
 * l'ha protetta soltanto l'imprevedibilità del cuid chiunque fosse loggato
 * poteva leggere la posizione esatta di un collega.
 */
setupIntegrationDb()

/** Gli utenti del seed nascono con `mustChangePassword`, che `withAuth` blocca. */
async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

async function entraComeUtente(userId: string) {
  const session = await loginAsUser(userId)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

/** Un collega diverso da quello restituito da `loginAs('staff')`. */
async function altroStaff(escluso: string) {
  const user = await prisma.user.findFirst({
    where: { role: { name: 'staff' }, isActive: true, id: { not: escluso } },
    orderBy: { username: 'asc' },
  })
  if (!user) throw new Error('Serve un secondo utente staff nel seed.')
  return user
}

/** Anomalia con la timbratura che la origina, coordinate comprese. */
async function anomaliaConGps(userId: string) {
  const venue = await venueDiTest()

  const record = await prisma.attendanceRecord.create({
    data: {
      userId,
      venueId: venue.id,
      punchType: 'IN',
      punchedAt: new Date('2026-03-15T08:03:00Z'),
      latitude: 45.955_000,
      longitude: 12.502_000,
      distanceFromVenue: 1_240.5,
      isWithinRadius: false,
      deviceInfo: 'iPhone 15 Pro; iOS 18.3',
    },
  })

  return prisma.attendanceAnomaly.create({
    data: {
      userId,
      venueId: venue.id,
      recordId: record.id,
      anomalyType: 'OUTSIDE_LOCATION',
      date: new Date('2026-03-15'),
      description: 'Timbratura fuori sede',
    },
  })
}

describe('GET /api/attendance/anomalies/[id]', () => {
  it('non lascia che uno staff legga la posizione GPS di un collega', async () => {
    const segnalato = await altroStaff((await loginAs('staff')).user.id)
    const anomalia = await anomaliaConGps(segnalato.id)
    await entraCome('staff')

    const { status, body } = await callRoute<{ data?: unknown }>(
      dettaglioAnomalia,
      jsonRequest(`/api/attendance/anomalies/${anomalia.id}`),
      { id: anomalia.id }
    )

    expect(status).toBe(403)
    // Non basta lo stato: la difesa vale se le coordinate non escono comunque.
    expect(JSON.stringify(body)).not.toContain('12.502')
  })

  it("non lascia che uno staff legga nemmeno la propria anomalia da questa route", async () => {
    const io = await entraCome('staff')
    const anomalia = await anomaliaConGps(io.user.id)

    const { status } = await callRoute(
      dettaglioAnomalia,
      jsonRequest(`/api/attendance/anomalies/${anomalia.id}`),
      { id: anomalia.id }
    )

    // La route è il pannello di gestione delle anomalie, non il portale del
    // dipendente: il portale legge le proprie presenze da altre route.
    expect(status).toBe(403)
  })

  it('lo concede a un manager, che le anomalie le deve gestire', async () => {
    const segnalato = await altroStaff((await loginAs('staff')).user.id)
    const anomalia = await anomaliaConGps(segnalato.id)
    await entraCome('manager')

    const { status, body } = await callRoute<{
      data: { record: { latitude: string | number } }
    }>(dettaglioAnomalia, jsonRequest(`/api/attendance/anomalies/${anomalia.id}`), {
      id: anomalia.id,
    })

    expect(status).toBe(200)
    expect(Number(body.data.record.latitude)).toBeCloseTo(45.955, 3)
  })

  it('risponde 401 a chi non è autenticato', async () => {
    const segnalato = await altroStaff((await loginAs('staff')).user.id)
    const anomalia = await anomaliaConGps(segnalato.id)
    setSession(null)

    const { status } = await callRoute(
      dettaglioAnomalia,
      jsonRequest(`/api/attendance/anomalies/${anomalia.id}`),
      { id: anomalia.id }
    )

    expect(status).toBe(401)
  })

  it('risponde 404 a un manager se l\'anomalia non esiste', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      dettaglioAnomalia,
      jsonRequest('/api/attendance/anomalies/inesistente'),
      { id: 'inesistente' }
    )

    expect(status).toBe(404)
  })
})

describe('PUT /api/attendance/anomalies/[id]', () => {
  it('resta vietata allo staff, come prima della conversione', async () => {
    const segnalato = await altroStaff((await loginAs('staff')).user.id)
    const anomalia = await anomaliaConGps(segnalato.id)
    await entraComeUtente(segnalato.id)

    const { status } = await callRoute(
      risolviAnomalia,
      jsonRequest(`/api/attendance/anomalies/${anomalia.id}`, {
        method: 'PUT',
        body: { action: 'APPROVED' },
      }),
      { id: anomalia.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.attendanceAnomaly.findUnique({ where: { id: anomalia.id } })
    expect(dopo?.status).toBe('PENDING')
  })

  it('resta consentita a un manager', async () => {
    const segnalato = await altroStaff((await loginAs('staff')).user.id)
    const anomalia = await anomaliaConGps(segnalato.id)
    const manager = await entraCome('manager')

    const { status } = await callRoute(
      risolviAnomalia,
      jsonRequest(`/api/attendance/anomalies/${anomalia.id}`, {
        method: 'PUT',
        body: { action: 'APPROVED', notes: 'Verificato con il diretto interessato' },
      }),
      { id: anomalia.id }
    )

    expect(status).toBe(200)
    const dopo = await prisma.attendanceAnomaly.findUnique({ where: { id: anomalia.id } })
    expect(dopo?.status).toBe('APPROVED')
    expect(dopo?.resolvedBy).toBe(manager.user.id)
  })
})
