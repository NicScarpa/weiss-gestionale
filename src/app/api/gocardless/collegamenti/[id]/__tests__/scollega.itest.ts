import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { DELETE as scollega } from '../route'

setupIntegrationDb()

async function collegamentoConConto() {
  const venue = await venueDiTest()
  const connessione = await prisma.bankConnection.create({
    data: { venueId: venue.id, institutionId: 'X', institutionName: 'Banca Finta', requisitionId: 'req-1', status: 'LN' },
  })
  const conto = await prisma.bankAccount.create({
    data: {
      venueId: venue.id,
      name: 'Conto principale',
      accountType: 'BANK',
      iban: 'IT00X0000000000000000001111',
      currency: 'EUR',
      connectionId: connessione.id,
      providerAccountId: 'gc-a',
      syncEnabled: true,
      syncCutoffDate: new Date('2026-08-12T00:00:00.000Z'),
    },
  })
  return { venue, connessione, conto }
}

describe('DELETE di un collegamento', () => {
  it('spegne i conti e stacca il collegamento', async () => {
    await entraCome('admin')
    const { connessione, conto } = await collegamentoConConto()

    const esito = await callRoute(scollega, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' }), { id: connessione.id })

    expect(esito.status).toBe(200)
    expect(await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })).toMatchObject({
      syncEnabled: false,
      connectionId: null,
      providerAccountId: null,
    })
    // `deletedAt` va nominato esplicitamente nella where: l'estensione di
    // @/lib/prisma filtra le righe cancellate anche sulle letture per chiave
    // unica, quindi una `findUniqueOrThrow({ where: { id } })` non
    // troverebbe più questa riga dopo lo scollegamento.
    const riga = await prisma.bankConnection.findUniqueOrThrow({
      where: { id: connessione.id, deletedAt: { not: null } },
    })
    expect(riga.deletedAt).not.toBeNull()
  })

  // I movimenti sono scritture contabili: scollegare la banca non li cancella.
  it('non tocca i movimenti già importati', async () => {
    await entraCome('admin')
    const { venue, connessione, conto } = await collegamentoConConto()
    await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        bankAccountId: conto.id,
        providerTransactionId: '20260810-1',
        transactionDate: new Date('2026-08-10T00:00:00.000Z'),
        description: 'Movimento di prova',
        amount: '10.00',
        importSource: 'PSD2_GOCARDLESS',
      },
    })

    await callRoute(scollega, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' }), { id: connessione.id })

    expect(await prisma.bankTransaction.count({ where: { bankAccountId: conto.id, deletedAt: null } })).toBe(1)
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('manager')
    const { connessione } = await collegamentoConConto()

    const esito = await callRoute(scollega, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' }), { id: connessione.id })

    expect(esito.status).toBe(403)
  })
})
