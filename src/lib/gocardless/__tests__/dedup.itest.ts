import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { filtraGiaPresenti } from '../dedup'
import { mappaMovimenti } from '../mapper'
import { rispostaMovimentiSchema } from '../types'
import contoA from './fixtures/movimenti-conto-a.json'
import contoB from './fixtures/movimenti-conto-b.json'

setupIntegrationDb()

/** Un conto bancario di prova, con IBAN diverso a ogni chiamata. */
async function contoDiTest(nome: string) {
  const venue = await venueDiTest()
  return prisma.bankAccount.create({
    data: {
      venueId: venue.id,
      name: nome,
      accountType: 'BANK',
      iban: `IT00X000000000000000000${Math.floor(Math.random() * 9000 + 1000)}`,
      currency: 'EUR',
    },
  })
}

async function salva(bankAccountId: string, venueId: string, movimenti: ReturnType<typeof mappaMovimenti>) {
  await prisma.bankTransaction.createMany({
    data: movimenti.map((m) => ({
      venueId,
      bankAccountId,
      providerTransactionId: m.providerTransactionId,
      transactionDate: m.transactionDate,
      valueDate: m.valueDate,
      description: m.description,
      amount: m.amount,
      bankTransactionCode: m.bankTransactionCode,
      importSource: 'PSD2_GOCARDLESS' as const,
    })),
  })
}

describe('deduplicazione dei movimenti del provider', () => {
  it('al primo giro sono tutti nuovi', async () => {
    const conto = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))

    const esito = await filtraGiaPresenti(prisma, { bankAccountId: conto.id, movimenti })

    expect(esito.nuovi).toHaveLength(6)
    expect(esito.duplicati).toBe(0)
  })

  it('al secondo giro sono tutti duplicati', async () => {
    const conto = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    await salva(conto.id, conto.venueId, movimenti)

    const esito = await filtraGiaPresenti(prisma, { bankAccountId: conto.id, movimenti })

    expect(esito.nuovi).toHaveLength(0)
    expect(esito.duplicati).toBe(6)
  })

  // IL TEST CHE CONTA. `20260810-1` e `20260810-2` esistono su entrambi i
  // conti riferiti a movimenti diversi. Con una chiave che non contiene il
  // conto, questi due sparirebbero.
  it('non confonde due movimenti diversi che condividono l\'identificativo su conti diversi', async () => {
    const a = await contoDiTest('Conto A')
    const b = await contoDiTest('Conto B')
    const movimentiA = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    const movimentiB = mappaMovimenti(rispostaMovimentiSchema.parse(contoB))

    // Gli identificativi si sovrappongono davvero: se questa asserzione cade,
    // le fixture sono state cambiate e il test non prova più niente.
    const idA = new Set(movimentiA.map((m) => m.providerTransactionId))
    expect(movimentiB.every((m) => idA.has(m.providerTransactionId))).toBe(true)

    await salva(a.id, a.venueId, movimentiA)
    const esito = await filtraGiaPresenti(prisma, { bankAccountId: b.id, movimenti: movimentiB })

    expect(esito.nuovi).toHaveLength(2)
    expect(esito.duplicati).toBe(0)
  })

  it('PostgreSQL accetta lo stesso identificativo su conti diversi', async () => {
    const a = await contoDiTest('Conto A')
    const b = await contoDiTest('Conto B')
    const movimentiA = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    const movimentiB = mappaMovimenti(rispostaMovimentiSchema.parse(contoB))

    await salva(a.id, a.venueId, movimentiA)
    await expect(salva(b.id, b.venueId, movimentiB)).resolves.not.toThrow()

    const quanti = await prisma.bankTransaction.count({
      where: { providerTransactionId: '20260810-1' },
    })
    expect(quanti).toBe(2)
  })

  it('PostgreSQL rifiuta lo stesso identificativo sullo stesso conto', async () => {
    const a = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))
    await salva(a.id, a.venueId, movimenti)

    await expect(salva(a.id, a.venueId, movimenti)).rejects.toThrow()
  })

  it('non tocca i movimenti degli altri conti quando non trova nulla', async () => {
    const a = await contoDiTest('Conto A')
    const movimenti = mappaMovimenti(rispostaMovimentiSchema.parse(contoA))

    const esito = await filtraGiaPresenti(prisma, { bankAccountId: a.id, movimenti: [] })

    expect(esito.nuovi).toHaveLength(0)
    expect(esito.duplicati).toBe(0)
  })
})
