import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { GET as leggiInvito, POST as rigeneraInvito } from '../route'

/**
 * Un invito è una credenziale: chi ha il link entra nel gestionale. La GET lo
 * creava quando non ne trovava uno attivo, cioè modificava stato — e con essa
 * bastava una richiesta di lettura (un prefetch, un link aperto per sbaglio, una
 * pagina ricaricata) per emettere una credenziale valida sette giorni.
 * L'emissione ora vive solo nella POST.
 */
setupIntegrationDb()

/** Vedi la nota in categorization-rules: gli utenti del seed nascono con `mustChangePassword`. */
async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

interface RispostaInvito {
  token: string | null
  url: string | null
}

describe('GET /api/staff/invite', () => {
  it('non emette alcun invito quando non ce ne sono di attivi', async () => {
    await entraCome('admin')

    const { status, body } = await callRoute<RispostaInvito>(
      leggiInvito,
      jsonRequest('/api/staff/invite')
    )

    expect(status).toBe(200)
    expect(body.token).toBeNull()
    expect(await prisma.invitationToken.count()).toBe(0)
  })

  it("restituisce l'invito attivo senza crearne un altro", async () => {
    const admin = await entraCome('admin')
    const invito = await prisma.invitationToken.create({
      data: {
        token: 'token-di-prova',
        invitedById: admin.user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    const { status, body } = await callRoute<RispostaInvito>(
      leggiInvito,
      jsonRequest('/api/staff/invite')
    )

    expect(status).toBe(200)
    expect(body.token).toBe(invito.token)
    expect(await prisma.invitationToken.count()).toBe(1)
  })

  it('resta riservata agli admin', async () => {
    await entraCome('manager')

    const { status } = await callRoute(leggiInvito, jsonRequest('/api/staff/invite'))

    expect(status).toBe(403)
    expect(await prisma.invitationToken.count()).toBe(0)
  })

  it('risponde 401 a chi non è autenticato', async () => {
    const { status } = await callRoute(leggiInvito, jsonRequest('/api/staff/invite'))

    expect(status).toBe(401)
    expect(await prisma.invitationToken.count()).toBe(0)
  })
})

describe('POST /api/staff/invite', () => {
  it("emette l'invito, che è l'unico punto in cui viene creato", async () => {
    await entraCome('admin')

    const { status, body } = await callRoute<RispostaInvito>(
      rigeneraInvito,
      jsonRequest('/api/staff/invite', { method: 'POST', body: { action: 'regenerate' } })
    )

    expect(status).toBe(200)
    expect(body.url).toContain(body.token!)
    expect(await prisma.invitationToken.count()).toBe(1)
  })

  it('resta riservata agli admin', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      rigeneraInvito,
      jsonRequest('/api/staff/invite', { method: 'POST', body: { action: 'regenerate' } })
    )

    expect(status).toBe(403)
    expect(await prisma.invitationToken.count()).toBe(0)
  })
})
