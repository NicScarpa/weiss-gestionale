import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { GET } from '../route'

/**
 * La lettura di un singolo cliente.
 *
 * La scheda in modifica ha bisogno di *quel* cliente e di tutti i suoi campi:
 * la lista ne restituisce solo tre, e scaricarla intera per pescarne uno
 * significherebbe leggere l'anagrafica completa a ogni apertura.
 */

setupIntegrationDb()

type Corpo = { error?: string; customer?: Record<string, unknown> }

async function cliente() {
  return prisma.customer.create({
    data: {
      denominazione: 'Bar Centrale',
      partitaIva: '01234567890',
      codiceFiscale: 'RSSMRA85M01H501W',
      citta: 'Sacile',
      paese: 'IT',
      paymentTermsDays: 60,
      telefono: '+39 0434 000000',
    },
  })
}

beforeEach(async () => {
  logout()
  await entraCome('admin')
})

describe('GET /api/customers/[id]', () => {
  it('restituisce il cliente con tutti i suoi campi', async () => {
    const creato = await cliente()

    const risposta = await callRoute<Corpo, { id: string }>(
      GET,
      jsonRequest(`http://localhost/api/customers/${creato.id}`),
      { id: creato.id }
    )

    expect(risposta.status).toBe(200)
    expect(risposta.body.customer).toMatchObject({
      denominazione: 'Bar Centrale',
      partitaIva: '01234567890',
      citta: 'Sacile',
      paese: 'IT',
      paymentTermsDays: 60,
      telefono: '+39 0434 000000',
    })
  })

  it('restituisce il codice fiscale in chiaro a chi ha diritto di vederlo', async () => {
    const creato = await cliente()

    const risposta = await callRoute<Corpo, { id: string }>(
      GET,
      jsonRequest(`http://localhost/api/customers/${creato.id}`),
      { id: creato.id }
    )

    expect(risposta.body.customer?.codiceFiscale).toBe('RSSMRA85M01H501W')
  })

  it('risponde 404 su un cliente che non esiste', async () => {
    const risposta = await callRoute<Corpo, { id: string }>(
      GET,
      jsonRequest('http://localhost/api/customers/inesistente'),
      { id: 'inesistente' }
    )

    expect(risposta.status).toBe(404)
  })

  it('nega la lettura allo staff: la scheda mostra il codice fiscale in chiaro', async () => {
    const creato = await cliente()
    logout()
    await entraCome('staff')

    const risposta = await callRoute<Corpo, { id: string }>(
      GET,
      jsonRequest(`http://localhost/api/customers/${creato.id}`),
      { id: creato.id }
    )

    expect(risposta.status).toBe(403)
  })

  it('nega la lettura a chi non ha effettuato l\'accesso', async () => {
    const creato = await cliente()
    logout()

    const risposta = await callRoute<Corpo, { id: string }>(
      GET,
      jsonRequest(`http://localhost/api/customers/${creato.id}`),
      { id: creato.id }
    )

    expect(risposta.status).toBe(401)
  })
})
