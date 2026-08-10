import { describe, it, expect } from 'vitest'
import type { PaymentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as getSummary } from '../route'

/**
 * Conteggio dei pagamenti per stato.
 *
 * Contava in SQL grezzo, e da lì venivano due difetti: il cast dell'id di sede
 * a `uuid` (gli id sono cuid, cioè testo) faceva fallire la richiesta, e la
 * lettura diretta della tabella scavalcava il filtro sui pagamenti cancellati.
 * La chiave `daApprovare`, poi, non veniva mai valorizzata perché ricavata da
 * `DA_APPROVARE.toLowerCase()`.
 */
setupIntegrationDb()

async function creaPagamento(stato: PaymentStatus) {
  const venue = await venueDiTest()

  return prisma.payment.create({
    data: {
      venueId: venue.id,
      tipo: 'BONIFICO',
      stato,
      dataEsecuzione: new Date('2026-05-20'),
      importo: 100,
      beneficiarioNome: 'Fornitore di prova',
    },
  })
}

async function summary() {
  const risposta = await callRoute<Record<string, number>>(
    getSummary,
    jsonRequest('/api/pagamenti/summary')
  )

  expect(risposta.status).toBe(200)
  return risposta.body
}

describe('GET /api/pagamenti/summary', () => {
  it('conta i pagamenti in attesa di approvazione', async () => {
    await loginAs('admin')
    await creaPagamento('DA_APPROVARE')
    await creaPagamento('DA_APPROVARE')

    expect((await summary()).daApprovare).toBe(2)
  })

  it('riporta a zero gli stati senza pagamenti', async () => {
    await loginAs('admin')
    await creaPagamento('DISPOSTO')

    const dati = await summary()

    expect(dati.disposto).toBe(1)
    expect(dati.bozza).toBe(0)
    expect(dati.annullato).toBe(0)
  })

  it('non conta i pagamenti cancellati', async () => {
    await loginAs('admin')
    await creaPagamento('DISPOSTO')
    const cancellato = await creaPagamento('DISPOSTO')
    await prisma.payment.update({
      where: { id: cancellato.id },
      data: { deletedAt: new Date() },
    })

    expect((await summary()).disposto).toBe(1)
  })

  it('senza sessione risponde 401', async () => {
    const risposta = await callRoute(getSummary, jsonRequest('/api/pagamenti/summary'))

    expect(risposta.status).toBe(401)
  })
})
