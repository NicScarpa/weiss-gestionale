import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { seedCategorieCashFlow } from '../seed-categorie'

let venueId: string

beforeAll(async () => {
  // getVenueId() e non venue.findFirst(): è la regola del progetto, e vale
  // anche nei test — è la stessa sede che vedrà il codice di produzione.
  venueId = await getVenueId()
})

afterAll(async () => {
  await prisma.accountBudgetMapping.deleteMany({
    where: { budgetCategory: { code: { startsWith: 'CF_' } } },
  })
  await prisma.budgetCategory.deleteMany({ where: { code: { startsWith: 'CF_' } } })
})

describe('seedCategorieCashFlow', () => {
  it('crea 9 famiglie e 39 sottogruppi, tutti agganciati al loro padre', async () => {
    const esito = await seedCategorieCashFlow(venueId)

    expect(esito.famiglieCreate).toBe(9)
    expect(esito.sottogruppiCreati).toBe(39)

    const famiglie = await prisma.budgetCategory.findMany({
      where: { venueId, code: { startsWith: 'CF_' }, parentId: null },
    })
    const sottogruppi = await prisma.budgetCategory.findMany({
      where: { venueId, code: { startsWith: 'CF_' }, parentId: { not: null } },
    })

    expect(famiglie).toHaveLength(9)
    expect(sottogruppi).toHaveLength(39)
    for (const sottogruppo of sottogruppi) {
      expect(famiglie.some((f) => f.id === sottogruppo.parentId)).toBe(true)
    }
  })

  it('è idempotente: rieseguirlo non duplica nulla', async () => {
    await seedCategorieCashFlow(venueId)
    const dopoPrima = await prisma.budgetCategory.count({
      where: { venueId, code: { startsWith: 'CF_' } },
    })

    await seedCategorieCashFlow(venueId)
    const dopoSeconda = await prisma.budgetCategory.count({
      where: { venueId, code: { startsWith: 'CF_' } },
    })

    expect(dopoSeconda).toBe(dopoPrima)
    expect(dopoSeconda).toBe(48)
  })

  it('disattiva le categorie generiche invece di cancellarle', async () => {
    await prisma.budgetCategory.upsert({
      where: { venueId_code: { venueId, code: 'FOOD_COST' } },
      update: { isActive: true },
      create: {
        venueId,
        code: 'FOOD_COST',
        name: 'Food Cost (Materie Prime)',
        categoryType: 'COST',
        isSystem: true,
      },
    })

    await seedCategorieCashFlow(venueId)

    const vecchia = await prisma.budgetCategory.findUnique({
      where: { venueId_code: { venueId, code: 'FOOD_COST' } },
    })

    expect(vecchia).not.toBeNull()
    expect(vecchia!.isActive).toBe(false)
  })

  it('elenca i conti che il piano prevede ma il database non ha ancora', async () => {
    const esito = await seedCategorieCashFlow(venueId)

    // Finché la migrazione del piano v4 non è stata eseguita, i conti non ci
    // sono: il seed non fallisce, li elenca.
    for (const codice of esito.contiMancanti) {
      const conto = await prisma.account.findUnique({ where: { code: codice } })
      expect(conto).toBeNull()
    }
    expect(esito.mappingCreati + esito.contiMancanti.length).toBe(149)
  })
})
