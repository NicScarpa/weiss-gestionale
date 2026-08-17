import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { ricalcolaCausali } from '../ricalcola-causali'

setupIntegrationDb()

async function rigaGrezza(description: string, codice: string | null, extra: Record<string, unknown> = {}) {
  const venue = await prisma.venue.findFirstOrThrow()
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id,
      transactionDate: new Date('2026-08-10'),
      description,
      amount: -10,
      bankTransactionCode: codice,
      importSource: 'PSD2_GOCARDLESS',
      status: 'PENDING',
      ...extra,
    },
  })
}

describe('ricalcolaCausali', () => {
  it('separa causale e descrizione sulle righe che non le hanno, e le conta per codice', async () => {
    const a = await rigaGrezza('Bonifico a vs favore *ROSSI SRL', '48//00')
    const b = await rigaGrezza('Commissioni', '16//00')

    const esito = await ricalcolaCausali(prisma)

    expect(esito).toEqual({ esaminate: 2, aggiornate: 2, perCodice: { '48//00': 1, '16//00': 1 } })
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      causale: 'Bonifico a vs favore',
      descrizione: 'ROSSI SRL',
      description: 'Bonifico a vs favore *ROSSI SRL', // il grezzo non si tocca
    })
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
      causale: 'Commissioni',
      descrizione: '',
    })
  })

  // Idempotente per costruzione: la seconda volta non trova nulla da fare.
  it('girato due volte non cambia nulla', async () => {
    await rigaGrezza('Bonifico a vs favore *ROSSI SRL', '48//00')
    await ricalcolaCausali(prisma)
    const seconda = await ricalcolaCausali(prisma)
    expect(seconda.esaminate).toBe(0)
    expect(seconda.aggiornate).toBe(0)
  })

  it('non tocca una descrizione già scritta', async () => {
    const r = await rigaGrezza('Bonifico a vs favore *ROSSI SRL', '48//00', { descrizione: 'Rossi S.r.l., saldo fattura 12', causale: 'Bonifico' })
    await ricalcolaCausali(prisma)
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      descrizione: 'Rossi S.r.l., saldo fattura 12',
      causale: 'Bonifico',
    })
  })

  it('in prova (dryRun) conta senza scrivere', async () => {
    const r = await rigaGrezza('Commissioni', '16//00')
    const esito = await ricalcolaCausali(prisma, { dryRun: true })
    expect(esito.aggiornate).toBe(1)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).causale).toBeNull()
  })

  // L'estensione soft-delete nasconde il Cestino a ogni query senza `deletedAt`
  // esplicito: senza la seconda passata queste righe resterebbero grezze.
  it('separa anche le righe nel Cestino', async () => {
    const r = await rigaGrezza('Giro conto *WEISS S.R.L. Giroconto', '34//00', { deletedAt: new Date() })
    await ricalcolaCausali(prisma)
    const riga = await prisma.bankTransaction.findFirstOrThrow({ where: { id: r.id, deletedAt: { not: null } } })
    expect(riga).toMatchObject({ causale: 'Giro conto', descrizione: 'WEISS S.R.L. Giroconto' })
  })
})
