import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as elencoCategorie, POST as creaCategoria } from '../route'
import { PUT as modificaCategoria, DELETE as eliminaCategoria } from '../[id]/route'
import { GET as elencoMappature, POST as creaMappatura } from '../mappings/route'
import { PUT as riordina } from '../reorder/route'
import { POST as seminaCategorie } from '../seed/route'

/**
 * Il piano delle categorie di budget è la struttura su cui si costruiscono
 * budget, report e analisi costi: modificarlo significa cambiare il significato
 * dei numeri, quindi è riservato ad admin e manager (finding A2-05).
 */
setupIntegrationDb()

/** Vedi la nota in categorization-rules: gli utenti del seed nascono con `mustChangePassword`. */
async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

async function categoria(code = 'FOOD_COST') {
  const venue = await venueDiTest()
  return prisma.budgetCategory.create({
    data: { venueId: venue.id, code, name: 'Food Cost', categoryType: 'COST' },
  })
}

describe('/api/budget-categories', () => {
  it("nega a uno staff l'elenco delle categorie", async () => {
    await entraCome('staff')

    const { status } = await callRoute(elencoCategorie, jsonRequest('/api/budget-categories'))

    expect(status).toBe(403)
  })

  it('lo concede a un manager senza chiedergli il venueId', async () => {
    await categoria()
    await entraCome('manager')

    const { status, body } = await callRoute<{ total: number }>(
      elencoCategorie,
      jsonRequest('/api/budget-categories')
    )

    expect(status).toBe(200)
    expect(body.total).toBe(1)
  })

  it('impedisce a uno staff di creare una categoria', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      creaCategoria,
      jsonRequest('/api/budget-categories', {
        method: 'POST',
        body: { code: 'ABUSIVA', name: 'Categoria abusiva' },
      })
    )

    expect(status).toBe(403)
    expect(await prisma.budgetCategory.count()).toBe(0)
  })

  it('impedisce a uno staff di modificare una categoria', async () => {
    const esistente = await categoria()
    await entraCome('staff')

    const { status } = await callRoute(
      modificaCategoria,
      jsonRequest(`/api/budget-categories/${esistente.id}`, {
        method: 'PUT',
        body: { name: 'Rinominata' },
      }),
      { id: esistente.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.budgetCategory.findUnique({ where: { id: esistente.id } })
    expect(dopo?.name).toBe('Food Cost')
  })

  it('impedisce a uno staff di eliminare una categoria', async () => {
    const esistente = await categoria()
    await entraCome('staff')

    const { status } = await callRoute(
      eliminaCategoria,
      jsonRequest(`/api/budget-categories/${esistente.id}`, { method: 'DELETE' }),
      { id: esistente.id }
    )

    expect(status).toBe(403)
    expect(await prisma.budgetCategory.count()).toBe(1)
  })
})

describe('/api/budget-categories/mappings', () => {
  it('nega a uno staff la lettura delle mappature conto/categoria', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      elencoMappature,
      jsonRequest('/api/budget-categories/mappings')
    )

    expect(status).toBe(403)
  })

  it('impedisce a uno staff di creare una mappatura', async () => {
    const cat = await categoria()
    const conto = await prisma.account.findFirst({ where: { type: 'COSTO' } })
    await entraCome('staff')

    const { status } = await callRoute(
      creaMappatura,
      jsonRequest('/api/budget-categories/mappings', {
        method: 'POST',
        body: { accountId: conto?.id ?? 'inesistente', budgetCategoryId: cat.id },
      })
    )

    expect(status).toBe(403)
    expect(await prisma.accountBudgetMapping.count()).toBe(0)
  })
})

describe('/api/budget-categories/reorder', () => {
  it('impedisce a uno staff di riordinare le categorie', async () => {
    const cat = await categoria()
    await entraCome('staff')

    const { status } = await callRoute(
      riordina,
      jsonRequest('/api/budget-categories/reorder', {
        method: 'PUT',
        body: { items: [{ id: cat.id, displayOrder: 99 }] },
      })
    )

    expect(status).toBe(403)
    const dopo = await prisma.budgetCategory.findUnique({ where: { id: cat.id } })
    expect(dopo?.displayOrder).toBe(0)
  })

  it('lo consente a un manager', async () => {
    const cat = await categoria()
    await entraCome('manager')

    const { status } = await callRoute(
      riordina,
      jsonRequest('/api/budget-categories/reorder', {
        method: 'PUT',
        body: { items: [{ id: cat.id, displayOrder: 99 }] },
      })
    )

    expect(status).toBe(200)
    const dopo = await prisma.budgetCategory.findUnique({ where: { id: cat.id } })
    expect(dopo?.displayOrder).toBe(99)
  })
})

describe('/api/budget-categories/seed', () => {
  it('impedisce a uno staff di generare il piano di categorie', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      seminaCategorie,
      jsonRequest('/api/budget-categories/seed', { method: 'POST', body: {} })
    )

    expect(status).toBe(403)
    expect(await prisma.budgetCategory.count()).toBe(0)
  })

  it('lo consente a un manager', async () => {
    await entraCome('manager')

    const { status } = await callRoute(
      seminaCategorie,
      jsonRequest('/api/budget-categories/seed', { method: 'POST', body: {} })
    )

    expect(status).toBe(200)
    expect(await prisma.budgetCategory.count()).toBeGreaterThan(0)
  })
})
