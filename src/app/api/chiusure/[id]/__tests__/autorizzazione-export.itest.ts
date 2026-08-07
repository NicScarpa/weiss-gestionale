import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaChiusura } from '@/test/integration/fixtures/closures'
import { POST as inviaChiusura } from '../submit/route'
import { GET as scaricaPdf } from '../pdf/route'
import { GET as scaricaExcel } from '../excel/route'

/**
 * Chi compila la chiusura di cassa a fine turno è lo staff: il layout della
 * dashboard glielo consente apposta, e il flusso salva, invia e apre il PDF di
 * riepilogo. Il ruolo `admin`/`manager` delle route finanziarie qui romperebbe
 * il prodotto, quindi il confine è un altro: lo staff resta dentro le proprie
 * chiusure, mentre l'export completo in Excel — che nessuna schermata usa —
 * torna ai soli gestori.
 */
setupIntegrationDb()

/** Vedi la nota in categorization-rules: gli utenti del seed nascono con `mustChangePassword`. */
async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

describe('POST /api/chiusure/[id]/submit', () => {
  it('consente allo staff di inviare la chiusura che ha compilato', async () => {
    const chiusura = await creaChiusura({ postazioni: [{ cashAmount: 500, posAmount: 300 }] })
    await entraCome('staff')

    const { status } = await callRoute(
      inviaChiusura,
      jsonRequest(`/api/chiusure/${chiusura.id}/submit`, { method: 'POST' }),
      { id: chiusura.id }
    )

    expect(status).toBe(200)
  })

  it('risponde 401 a chi non è autenticato', async () => {
    const chiusura = await creaChiusura({ postazioni: [{ cashAmount: 500, posAmount: 300 }] })

    const { status } = await callRoute(
      inviaChiusura,
      jsonRequest(`/api/chiusure/${chiusura.id}/submit`, { method: 'POST' }),
      { id: chiusura.id }
    )

    expect(status).toBe(401)
  })
})

describe('GET /api/chiusure/[id]/pdf', () => {
  it('consente allo staff di scaricare il PDF della chiusura che ha inviato', async () => {
    const staff = await entraCome('staff')
    const chiusura = await creaChiusura({
      status: 'SUBMITTED',
      submittedById: staff.user.id,
      postazioni: [{ cashAmount: 500, posAmount: 300 }],
    })

    const { status } = await callRoute(
      scaricaPdf,
      jsonRequest(`/api/chiusure/${chiusura.id}/pdf`),
      { id: chiusura.id }
    )

    expect(status).toBe(200)
  })

  it('nega allo staff il PDF di una chiusura altrui', async () => {
    const manager = await entraCome('manager')
    const chiusura = await creaChiusura({
      status: 'SUBMITTED',
      submittedById: manager.user.id,
      date: new Date('2026-03-16'),
      postazioni: [{ cashAmount: 500, posAmount: 300 }],
    })
    await entraCome('staff')

    const { status } = await callRoute(
      scaricaPdf,
      jsonRequest(`/api/chiusure/${chiusura.id}/pdf`),
      { id: chiusura.id }
    )

    expect(status).toBe(403)
  })

  it('lascia al manager il PDF di qualsiasi chiusura', async () => {
    const staff = await entraCome('staff')
    const chiusura = await creaChiusura({
      status: 'SUBMITTED',
      submittedById: staff.user.id,
      postazioni: [{ cashAmount: 500, posAmount: 300 }],
    })
    await entraCome('manager')

    const { status } = await callRoute(
      scaricaPdf,
      jsonRequest(`/api/chiusure/${chiusura.id}/pdf`),
      { id: chiusura.id }
    )

    expect(status).toBe(200)
  })
})

describe('GET /api/chiusure/[id]/excel', () => {
  it("nega allo staff l'export in Excel", async () => {
    const staff = await entraCome('staff')
    const chiusura = await creaChiusura({
      status: 'SUBMITTED',
      submittedById: staff.user.id,
      postazioni: [{ cashAmount: 500, posAmount: 300 }],
    })

    const { status } = await callRoute(
      scaricaExcel,
      jsonRequest(`/api/chiusure/${chiusura.id}/excel`),
      { id: chiusura.id }
    )

    expect(status).toBe(403)
  })

  it('lo concede a un manager', async () => {
    await entraCome('manager')
    const chiusura = await creaChiusura({ postazioni: [{ cashAmount: 500, posAmount: 300 }] })

    const { status } = await callRoute(
      scaricaExcel,
      jsonRequest(`/api/chiusure/${chiusura.id}/excel`),
      { id: chiusura.id }
    )

    expect(status).toBe(200)
  })
})
