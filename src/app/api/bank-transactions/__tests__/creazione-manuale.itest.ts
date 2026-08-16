import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { POST } from '../route'

setupIntegrationDb()

async function contoDiProva() {
  const venue = await prisma.venue.findFirstOrThrow()
  return prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Conto prova', accountType: 'BANK' } })
}

describe('POST /api/bank-transactions — riga manuale', () => {
  beforeEach(() => logout())

  it('senza conto risponde 400', async () => {
    await entraCome('admin')
    const r = await callRoute(POST, jsonRequest('http://localhost/api/bank-transactions', {
      method: 'POST',
      body: { transactionDate: '2026-08-10', amount: -10, descrizione: 'Prova' },
    }))
    expect(r.status).toBe(400)
  })

  it('crea la riga MANUAL col conto, la causale e le note', async () => {
    await entraCome('admin')
    const conto = await contoDiProva()
    const r = await callRoute<{ id: string }>(POST, jsonRequest('http://localhost/api/bank-transactions', {
      method: 'POST',
      body: { bankAccountId: conto.id, transactionDate: '2026-08-10', amount: -10, descrizione: 'Cancelleria', causale: 'Spesa varia', note: 'scontrino 12' },
    }))
    expect(r.status).toBe(200)
    const riga = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.body.id } })
    expect(riga).toMatchObject({ bankAccountId: conto.id, importSource: 'MANUAL', descrizione: 'Cancelleria', description: 'Cancelleria', causale: 'Spesa varia', note: 'scontrino 12', status: 'PENDING' })
  })

  it('come staff risponde 403', async () => {
    await entraCome('staff')
    const r = await callRoute(POST, jsonRequest('http://localhost/api/bank-transactions', { method: 'POST', body: {} }))
    expect(r.status).toBe(403)
  })
})
