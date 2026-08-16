import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { PATCH } from '../route'
import { GET as cronologiaGET } from '../cronologia/route'

setupIntegrationDb()

async function rigaDellaBanca(importSource: 'PSD2_GOCARDLESS' | 'MANUAL' = 'PSD2_GOCARDLESS') {
  const venue = await prisma.venue.findFirstOrThrow()
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id,
      transactionDate: new Date('2026-08-10'),
      description: 'Bonifico a vs favore *ROSSI SRL',
      descrizione: 'ROSSI SRL',
      causale: 'Bonifico a vs favore',
      amount: -100,
      importSource,
      status: 'PENDING',
    },
  })
}

function patch(id: string, body: unknown) {
  return callRoute<{ error?: string; descrizione?: string; modificato?: boolean }, { id: string }>(
    PATCH,
    jsonRequest(`http://localhost/api/bank-transactions/${id}`, { method: 'PATCH', body }),
    { id }
  )
}

describe('PATCH /api/bank-transactions/[id]', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('modifica descrizione, causale e note e scrive la cronologia', async () => {
    const r = await rigaDellaBanca()
    const risposta = await patch(r.id, { descrizione: 'Rossi S.r.l., saldo fattura 12', note: 'pagata in ritardo' })
    expect(risposta.status).toBe(200)
    expect(risposta.body.descrizione).toBe('Rossi S.r.l., saldo fattura 12')
    expect(risposta.body.modificato).toBe(true)

    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(dopo.description).toBe('Bonifico a vs favore *ROSSI SRL') // il grezzo non si tocca
    expect(dopo.causale).toBe('Bonifico a vs favore') // non toccata: non era nel corpo

    const cronologia = await prisma.bankTransactionEdit.findMany({ where: { bankTransactionId: r.id }, orderBy: { campo: 'asc' } })
    expect(cronologia.map((c) => [c.campo, c.prima, c.dopo])).toEqual([
      ['descrizione', 'ROSSI SRL', 'Rossi S.r.l., saldo fattura 12'],
      ['note', null, 'pagata in ritardo'],
    ])
  })

  it('un valore uguale a quello di prima non produce cronologia', async () => {
    const r = await rigaDellaBanca()
    await patch(r.id, { descrizione: 'ROSSI SRL' })
    expect(await prisma.bankTransactionEdit.count({ where: { bankTransactionId: r.id } })).toBe(0)
  })

  // Data, importo e verso sono della banca: la rotta li rifiuta per forma, non per permesso.
  it('rifiuta data e importo su una riga della banca', async () => {
    const r = await rigaDellaBanca()
    expect((await patch(r.id, { amount: -50 })).status).toBe(400)
    expect((await patch(r.id, { transactionDate: '2026-08-11' })).status).toBe(400)
    expect((await patch(r.id, { status: 'MATCHED' })).status).toBe(400)
    const intatta = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(Number(intatta.amount)).toBe(-100)
  })

  it('su una riga MANUAL accetta anche data e importo', async () => {
    const r = await rigaDellaBanca('MANUAL')
    const risposta = await patch(r.id, { amount: -80, transactionDate: '2026-08-11' })
    expect(risposta.status).toBe(200)
    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(Number(dopo.amount)).toBe(-80)
  })

  it('su una riga nel Cestino risponde 404', async () => {
    const r = await rigaDellaBanca()
    await prisma.bankTransaction.update({ where: { id: r.id }, data: { deletedAt: new Date() } })
    expect((await patch(r.id, { note: 'x' })).status).toBe(404)
  })

  it('come staff risponde 403', async () => {
    logout()
    await entraCome('staff')
    const r = await rigaDellaBanca()
    expect((await patch(r.id, { note: 'x' })).status).toBe(403)
  })
})

describe('GET /api/bank-transactions/[id]/cronologia', () => {
  it('elenca le modifiche, la più recente per prima, con chi le ha fatte', async () => {
    logout()
    const sessione = await entraCome('admin')
    const r = await rigaDellaBanca()
    await patch(r.id, { note: 'prima nota' })
    await patch(r.id, { note: 'seconda nota' })

    const risposta = await callRoute<{ modifiche: Array<{ campo: string; prima: string | null; dopo: string | null; utente: string | null }> }, { id: string }>(
      cronologiaGET,
      jsonRequest(`http://localhost/api/bank-transactions/${r.id}/cronologia`),
      { id: r.id }
    )
    expect(risposta.status).toBe(200)
    expect(risposta.body.modifiche.map((m) => [m.campo, m.prima, m.dopo])).toEqual([
      ['note', 'prima nota', 'seconda nota'],
      ['note', null, 'prima nota'],
    ])
    // `session.user` non ha `.name` (l'augmentation in `src/lib/auth.ts` non lo
    // popola mai): la rotta ricava il nome da `firstName + ' ' + lastName`
    // dell'utente del seed, quindi l'atteso è quello, non `sessione.user.name`.
    expect(risposta.body.modifiche[0].utente).toBe(`${sessione.user.firstName} ${sessione.user.lastName}`)
  })

  it('la cronologia si legge anche dal Cestino', async () => {
    logout()
    await entraCome('admin')
    const r = await rigaDellaBanca()
    await patch(r.id, { note: 'prima del cestino' })
    await prisma.bankTransaction.update({ where: { id: r.id }, data: { deletedAt: new Date() } })

    const risposta = await callRoute<{ modifiche: Array<{ campo: string; prima: string | null; dopo: string | null }> }, { id: string }>(
      cronologiaGET,
      jsonRequest(`http://localhost/api/bank-transactions/${r.id}/cronologia`),
      { id: r.id }
    )
    expect(risposta.status).toBe(200)
    expect(risposta.body.modifiche.map((m) => [m.campo, m.prima, m.dopo])).toEqual([
      ['note', null, 'prima del cestino'],
    ])
  })
})
