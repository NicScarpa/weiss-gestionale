import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { POST as ignora } from '@/app/api/bank-transactions/[id]/ignore/route'
import { POST as annullaMatch } from '@/app/api/bank-transactions/[id]/unmatch/route'

/**
 * Che cosa risponde la riconciliazione bancaria su una transazione cancellata.
 *
 * `ignoreTransaction` e `unmatch` scrivevano senza prima guardare se la riga
 * ci fosse ancora: su una transazione cancellata l'aggiornamento passava
 * liscio. Ora il client non la trova più, e la domanda diventa che cosa deve
 * vedere l'utente — una transazione che non esiste è un 404, non un guasto del
 * server.
 */
setupIntegrationDb()

async function creaTransazione() {
  const venue = await venueDiTest()
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id,
      transactionDate: new Date('2026-07-01'),
      description: 'Bonifico da cancellare',
      amount: 250,
      status: 'PENDING',
    },
  })
}

/** Cancella logicamente la transazione, scavalcando il filtro del client. */
async function cancella(id: string) {
  await prisma.bankTransaction.updateMany({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

async function statoGrezzo(id: string) {
  const righe = await prisma.$queryRaw<{ status: string }[]>`
    SELECT status FROM bank_transactions WHERE id = ${id}
  `
  return righe[0]?.status ?? null
}

beforeEach(async () => {
  await loginAs('admin')
})

describe('POST /api/bank-transactions/[id]/ignore', () => {
  it('su una transazione cancellata risponde 404 senza toccarla', async () => {
    const transazione = await creaTransazione()
    await cancella(transazione.id)

    const risposta = await callRoute<{ error?: string }>(
      ignora,
      jsonRequest(`/api/bank-transactions/${transazione.id}/ignore`, { method: 'POST' }),
      { id: transazione.id }
    )

    expect(risposta.status).toBe(404)
    expect(await statoGrezzo(transazione.id)).toBe('PENDING')
  })

  it('continua a ignorare le transazioni vive', async () => {
    const transazione = await creaTransazione()

    const risposta = await callRoute(
      ignora,
      jsonRequest(`/api/bank-transactions/${transazione.id}/ignore`, { method: 'POST' }),
      { id: transazione.id }
    )

    expect(risposta.status).toBe(200)
    expect(await statoGrezzo(transazione.id)).toBe('IGNORED')
  })
})

describe('POST /api/bank-transactions/[id]/unmatch', () => {
  it('su una transazione cancellata risponde 404 senza toccarla', async () => {
    const transazione = await creaTransazione()
    await prisma.bankTransaction.update({
      where: { id: transazione.id },
      data: { status: 'MATCHED' },
    })
    await cancella(transazione.id)

    const risposta = await callRoute<{ error?: string }>(
      annullaMatch,
      jsonRequest(`/api/bank-transactions/${transazione.id}/unmatch`, { method: 'POST' }),
      { id: transazione.id }
    )

    expect(risposta.status).toBe(404)
    expect(await statoGrezzo(transazione.id)).toBe('MATCHED')
  })

  it('continua ad annullare il match delle transazioni vive', async () => {
    const transazione = await creaTransazione()
    await prisma.bankTransaction.update({
      where: { id: transazione.id },
      data: { status: 'MATCHED' },
    })

    const risposta = await callRoute(
      annullaMatch,
      jsonRequest(`/api/bank-transactions/${transazione.id}/unmatch`, { method: 'POST' }),
      { id: transazione.id }
    )

    expect(risposta.status).toBe(200)
    expect(await statoGrezzo(transazione.id)).toBe('PENDING')
  })
})
