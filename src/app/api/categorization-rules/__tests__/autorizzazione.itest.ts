import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as elencoRegole, POST as creaRegola } from '../route'
import { PATCH as modificaRegola, DELETE as eliminaRegola } from '../[id]/route'
import { GET as elencoProposte, POST as applicaProposta } from '../proposals/route'
import { POST as provaRegola } from '../test/route'

/**
 * Le regole di categorizzazione riscrivono la classificazione della prima nota:
 * sono dati finanziari, e `src/CLAUDE.md` li riserva ad admin e manager. Prima
 * della centralizzazione dell'auth queste route si fermavano al controllo di
 * sessione, quindi un dipendente autenticato — nel contesto reale un barista
 * con accesso al portale dal telefono — poteva riclassificare in blocco
 * scritture contabili a sua scelta (finding A2-01).
 */
setupIntegrationDb()

async function categoriaBudget() {
  const venue = await venueDiTest()
  return prisma.budgetCategory.create({
    data: { venueId: venue.id, code: 'FOOD_COST', name: 'Food Cost', categoryType: 'COST' },
  })
}

async function regolaEsistente() {
  const venue = await venueDiTest()
  const categoria = await categoriaBudget()
  return prisma.categorizationRule.create({
    data: {
      venueId: venue.id,
      name: 'Panificio',
      direction: 'OUTFLOW',
      keywords: ['panificio'],
      priority: 5,
      budgetCategoryId: categoria.id,
    },
  })
}

/** Due scritture non categorizzate con lo stesso beneficiario: una proposta. */
async function scrittureNonCategorizzate() {
  const venue = await venueDiTest()
  const dati = {
    venueId: venue.id,
    date: new Date('2026-03-02'),
    registerType: 'CASH' as const,
    description: 'Spesa panificio',
    counterpartName: 'Panificio Rossi',
    creditAmount: 42.5,
  }
  const prima = await prisma.journalEntry.create({ data: dati })
  const seconda = await prisma.journalEntry.create({ data: dati })
  return [prima, seconda]
}

describe('GET /api/categorization-rules', () => {
  it('nega l\'elenco delle regole a uno staff', async () => {
    await entraCome('staff')

    const { status } = await callRoute(elencoRegole, jsonRequest('/api/categorization-rules'))

    expect(status).toBe(403)
  })

  it('lo concede a un manager', async () => {
    await entraCome('manager')
    await regolaEsistente()

    const { status, body } = await callRoute<{ data: unknown[] }>(
      elencoRegole,
      jsonRequest('/api/categorization-rules')
    )

    expect(status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  it('risponde 401 a chi non è autenticato', async () => {
    const { status } = await callRoute(elencoRegole, jsonRequest('/api/categorization-rules'))

    expect(status).toBe(401)
  })
})

describe('POST /api/categorization-rules', () => {
  it('impedisce a uno staff di creare una regola', async () => {
    await entraCome('staff')
    const categoria = await categoriaBudget()

    const { status } = await callRoute(
      creaRegola,
      jsonRequest('/api/categorization-rules', {
        method: 'POST',
        body: {
          name: 'Regola dello staff',
          direction: 'OUTFLOW',
          keywords: ['bar'],
          budgetCategoryId: categoria.id,
        },
      })
    )

    expect(status).toBe(403)
    expect(await prisma.categorizationRule.count()).toBe(0)
  })

  it('consente a un manager di crearla, ignorando il venueId del client', async () => {
    await entraCome('manager')
    const categoria = await categoriaBudget()
    const venue = await venueDiTest()

    const { status, body } = await callRoute<{ venueId: string }>(
      creaRegola,
      jsonRequest('/api/categorization-rules', {
        method: 'POST',
        body: {
          venueId: 'sede-di-un-altro',
          name: 'Panificio',
          direction: 'OUTFLOW',
          keywords: ['panificio'],
          budgetCategoryId: categoria.id,
        },
      })
    )

    expect(status).toBe(201)
    expect(body.venueId).toBe(venue.id)
  })
})

describe('/api/categorization-rules/[id]', () => {
  it('impedisce a uno staff di modificare una regola', async () => {
    const regola = await regolaEsistente()
    await entraCome('staff')

    const { status } = await callRoute(
      modificaRegola,
      jsonRequest(`/api/categorization-rules/${regola.id}`, {
        method: 'PATCH',
        body: { name: 'Rinominata' },
      }),
      { id: regola.id }
    )

    expect(status).toBe(403)
    const dopo = await prisma.categorizationRule.findUnique({ where: { id: regola.id } })
    expect(dopo?.name).toBe('Panificio')
  })

  it('impedisce a uno staff di eliminare una regola', async () => {
    const regola = await regolaEsistente()
    await entraCome('staff')

    const { status } = await callRoute(
      eliminaRegola,
      jsonRequest(`/api/categorization-rules/${regola.id}`, { method: 'DELETE' }),
      { id: regola.id }
    )

    expect(status).toBe(403)
    expect(await prisma.categorizationRule.count()).toBe(1)
  })

  it('consente a un manager di modificarla', async () => {
    const regola = await regolaEsistente()
    await entraCome('manager')

    const { status } = await callRoute(
      modificaRegola,
      jsonRequest(`/api/categorization-rules/${regola.id}`, {
        method: 'PATCH',
        body: { name: 'Rinominata' },
      }),
      { id: regola.id }
    )

    expect(status).toBe(200)
  })
})

describe('/api/categorization-rules/proposals', () => {
  it('nega le proposte a uno staff', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      elencoProposte,
      jsonRequest('/api/categorization-rules/proposals')
    )

    expect(status).toBe(403)
  })

  it('impedisce a uno staff di riclassificare le scritture di prima nota', async () => {
    const scritture = await scrittureNonCategorizzate()
    const categoria = await categoriaBudget()
    await entraCome('staff')

    const { status } = await callRoute(
      applicaProposta,
      jsonRequest('/api/categorization-rules/proposals', {
        method: 'POST',
        body: {
          keyword: 'Panificio Rossi',
          direction: 'OUTFLOW',
          budgetCategoryId: categoria.id,
          matchingEntryIds: scritture.map((s) => s.id),
          venueId: (await venueDiTest()).id,
        },
      })
    )

    expect(status).toBe(403)
    const dopo = await prisma.journalEntry.findMany({
      where: { id: { in: scritture.map((s) => s.id) } },
    })
    expect(dopo.every((e) => e.budgetCategoryId === null)).toBe(true)
    expect(await prisma.categorizationRule.count()).toBe(0)
  })

  it('consente a un manager di applicare la proposta', async () => {
    const scritture = await scrittureNonCategorizzate()
    const categoria = await categoriaBudget()
    await entraCome('manager')

    const { status } = await callRoute(
      applicaProposta,
      jsonRequest('/api/categorization-rules/proposals', {
        method: 'POST',
        body: {
          keyword: 'Panificio Rossi',
          direction: 'OUTFLOW',
          budgetCategoryId: categoria.id,
          matchingEntryIds: scritture.map((s) => s.id),
        },
      })
    )

    expect(status).toBe(201)
    const dopo = await prisma.journalEntry.findMany({
      where: { id: { in: scritture.map((s) => s.id) } },
    })
    expect(dopo.every((e) => e.budgetCategoryId === categoria.id)).toBe(true)
  })
})

describe('POST /api/categorization-rules/test', () => {
  it('nega la prova di una regola a uno staff', async () => {
    await entraCome('staff')

    const { status } = await callRoute(
      provaRegola,
      jsonRequest('/api/categorization-rules/test', {
        method: 'POST',
        body: { description: 'panificio rossi', amount: -10 },
      })
    )

    expect(status).toBe(403)
  })

  it('la consente a un manager', async () => {
    await regolaEsistente()
    await entraCome('manager')

    const { status, body } = await callRoute<{ matched: boolean }>(
      provaRegola,
      jsonRequest('/api/categorization-rules/test', {
        method: 'POST',
        body: { description: 'spesa panificio rossi', amount: -10 },
      })
    )

    expect(status).toBe(200)
    expect(body.matched).toBe(true)
  })
})
