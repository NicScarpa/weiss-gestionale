import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { GET as elenco, POST as crea } from '../route'
import { GET as dettaglio, PUT as modifica, DELETE as elimina } from '../[id]/route'
import { POST as approva } from '../[id]/approve/route'
import { POST as rifiuta } from '../[id]/reject/route'

/**
 * Le richieste di ferie: chi le vede, chi le approva e chi può crearle per
 * altri. Sono tre regole diverse su cinque route, ed è esattamente il tipo di
 * differenza che si perde riscrivendo il controllo a mano in ogni file.
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

async function tipoAssenza() {
  return prisma.leaveType.upsert({
    where: { code: 'FER' },
    create: { code: 'FER', name: 'Ferie' },
    update: {},
  })
}

async function richiesta(userId: string) {
  const tipo = await tipoAssenza()
  return prisma.leaveRequest.create({
    data: {
      userId,
      leaveTypeId: tipo.id,
      startDate: new Date('2026-04-10'),
      endDate: new Date('2026-04-12'),
      daysRequested: 3,
      status: 'PENDING',
    },
  })
}

describe('GET /api/leave-requests', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(elenco, jsonRequest('/api/leave-requests'))
    expect(status).toBe(401)
  })

  it('a uno staff mostra soltanto le proprie richieste', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    await richiesta(io.user.id)
    await richiesta(altro.id)

    const { status, body } = await callRoute<{ data: { userId: string }[] }>(
      elenco,
      jsonRequest('/api/leave-requests')
    )

    expect(status).toBe(200)
    expect(body.data.map((r) => r.userId)).toEqual([io.user.id])
  })

  it("ignora il userId della query per chi è staff", async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    await richiesta(altro.id)

    const { status, body } = await callRoute<{ data: unknown[] }>(
      elenco,
      jsonRequest('/api/leave-requests', { searchParams: { userId: altro.id } })
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(0)
  })

  it('a un manager mostra quelle di tutti', async () => {
    const staff = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    await richiesta(staff!.id)
    await entraCome('manager')

    const { status, body } = await callRoute<{ data: unknown[] }>(
      elenco,
      jsonRequest('/api/leave-requests')
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
  })
})

describe('POST /api/leave-requests', () => {
  it('impedisce a uno staff di chiedere ferie per un collega', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    const tipo = await tipoAssenza()

    const { status } = await callRoute(
      crea,
      jsonRequest('/api/leave-requests', {
        method: 'POST',
        body: {
          userId: altro.id,
          leaveTypeId: tipo.id,
          startDate: '2026-04-10',
          endDate: '2026-04-12',
        },
      })
    )

    expect(status).toBe(403)
    expect(await prisma.leaveRequest.count()).toBe(0)
  })
})

describe('GET /api/leave-requests/[id]', () => {
  it('non lascia che uno staff legga la richiesta di un collega', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    const sua = await richiesta(altro.id)

    const { status } = await callRoute(
      dettaglio,
      jsonRequest(`/api/leave-requests/${sua.id}`),
      { id: sua.id }
    )

    expect(status).toBe(403)
  })

  it('gli lascia leggere la propria', async () => {
    const io = await entraCome('staff')
    const mia = await richiesta(io.user.id)

    const { status } = await callRoute(
      dettaglio,
      jsonRequest(`/api/leave-requests/${mia.id}`),
      { id: mia.id }
    )

    expect(status).toBe(200)
  })
})

describe('PUT /api/leave-requests/[id]', () => {
  it('è riservata agli admin, nemmeno un manager la usa', async () => {
    const staff = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    const sua = await richiesta(staff!.id)
    await entraCome('manager')

    const { status } = await callRoute(
      modifica,
      jsonRequest(`/api/leave-requests/${sua.id}`, {
        method: 'PUT',
        body: { status: 'APPROVED' },
      }),
      { id: sua.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.leaveRequest.findUnique({ where: { id: sua.id } })
    expect(dopo?.status).toBe('PENDING')
  })
})

describe('DELETE /api/leave-requests/[id]', () => {
  it('non lascia che uno staff cancelli la richiesta di un collega', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)
    const sua = await richiesta(altro.id)

    const { status } = await callRoute(
      elimina,
      jsonRequest(`/api/leave-requests/${sua.id}`, { method: 'DELETE' }),
      { id: sua.id }
    )

    expect(status).toBe(403)
    expect(await prisma.leaveRequest.count()).toBe(1)
  })
})

describe('approvazione e rifiuto', () => {
  it('impedisce a uno staff di approvarsi le ferie', async () => {
    const io = await entraCome('staff')
    const mia = await richiesta(io.user.id)

    const { status } = await callRoute(
      approva,
      jsonRequest(`/api/leave-requests/${mia.id}/approve`, { method: 'POST', body: {} }),
      { id: mia.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.leaveRequest.findUnique({ where: { id: mia.id } })
    expect(dopo?.status).toBe('PENDING')
  })

  it('impedisce a uno staff di rifiutarle', async () => {
    const io = await entraCome('staff')
    const mia = await richiesta(io.user.id)

    const { status } = await callRoute(
      rifiuta,
      jsonRequest(`/api/leave-requests/${mia.id}/reject`, {
        method: 'POST',
        body: { rejectionReason: 'no' },
      }),
      { id: mia.id }
    )

    expect(status).toBe(403)
  })

  it('le consente a un manager', async () => {
    const staff = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    const sua = await richiesta(staff!.id)
    const manager = await entraCome('manager')

    const { status } = await callRoute(
      approva,
      jsonRequest(`/api/leave-requests/${sua.id}/approve`, { method: 'POST', body: {} }),
      { id: sua.id }
    )

    expect(status).toBe(200)
    const dopo = await prisma.leaveRequest.findUnique({ where: { id: sua.id } })
    expect(dopo?.status).toBe('APPROVED')
    expect(dopo?.approvedById).toBe(manager.user.id)
  })
})
