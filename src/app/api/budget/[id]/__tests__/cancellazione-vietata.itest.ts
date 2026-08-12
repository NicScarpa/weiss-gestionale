import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { DELETE as DELETE_budget, PUT as PUT_budget } from '../route'

/**
 * Il budget non si cancella.
 *
 * Decisione del committente: un budget è un documento contabile annuale, e non
 * esiste il caso in cui cancellarlo sia meglio che archiviarlo. Eliminare la
 * domanda invece di rispondere a «come si cancella senza lasciare macerie».
 *
 * Cosa faceva prima, verificato per esecuzione e non dedotto dallo schema: un
 * budget vuoto spariva davvero — cancellazione definitiva su un modello che ha
 * `deletedAt`, quindi il soft delete c'era e veniva scavalcato. Un budget con
 * righe invece non si cancellava affatto: `BudgetLine.budget` e
 * `BudgetAlert.budget` sono `onDelete: Restrict`, la violazione della chiave
 * esterna non era intercettata e usciva come 500. Il commento accanto alla
 * `delete` prometteva una cascade che nello schema non c'è mai stata.
 */
setupIntegrationDb()

let venueId: string

beforeEach(async () => {
  await loginAs('admin')
  venueId = (await venueDiTest()).id
})

async function creaBudget(status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' = 'DRAFT', year = 2027) {
  return prisma.budget.create({ data: { venueId, year, status, name: `Budget ${year}` } })
}

async function creaRiga(budgetId: string) {
  const account = await prisma.account.findFirstOrThrow({ where: { isActive: true } })
  return prisma.budgetLine.create({
    data: { budgetId, accountId: account.id, jan: 100, annualTotal: 100 },
  })
}

function cancella(id: string) {
  return callRoute<{ error?: string; alternativa?: string }, { id: string }>(
    DELETE_budget,
    jsonRequest(`/api/budget/${id}`, { method: 'DELETE' }),
    { id }
  )
}

describe('il DELETE del budget è sempre rifiutato', () => {
  it('un budget vuoto in bozza non si cancella più', async () => {
    const budget = await creaBudget('DRAFT')

    const esito = await cancella(budget.id)

    expect(esito.status).toBe(409)
    // Il budget è ancora lì: è il punto di tutta la decisione
    expect(await prisma.budget.findUnique({ where: { id: budget.id } })).not.toBeNull()
  })

  it('un budget con righe non si cancella, e le righe restano intatte', async () => {
    const budget = await creaBudget('DRAFT')
    const riga = await creaRiga(budget.id)

    const esito = await cancella(budget.id)

    expect(esito.status).toBe(409)
    expect(await prisma.budgetLine.findUnique({ where: { id: riga.id } })).not.toBeNull()
    expect(await prisma.budget.findUnique({ where: { id: budget.id } })).not.toBeNull()
  })

  it('vale anche per un budget attivo o archiviato', async () => {
    const attivo = await creaBudget('ACTIVE', 2027)
    const archiviato = await creaBudget('ARCHIVED', 2028)

    expect((await cancella(attivo.id)).status).toBe(409)
    expect((await cancella(archiviato.id)).status).toBe(409)
    expect(await prisma.budget.count()).toBe(2)
  })

  it("il rifiuto dice cosa fare invece, e nomina l'archiviazione", async () => {
    const budget = await creaBudget('DRAFT')

    const esito = await cancella(budget.id)

    // Un rifiuto che non indica l'alternativa è solo un ostacolo
    expect(esito.body.error).toMatch(/archiv/i)
  })

  it('un budget inesistente resta un 404, non un 409', async () => {
    // Il divieto non deve mangiarsi la diagnostica: chi sbaglia id deve
    // continuare a saperlo.
    expect((await cancella('budget-che-non-esiste')).status).toBe(404)
  })
})

describe("l'alternativa indicata funziona davvero", () => {
  it('archiviare il budget riesce, ed è ciò che il messaggio suggerisce', async () => {
    const budget = await creaBudget('DRAFT')

    const esito = await callRoute(
      PUT_budget,
      jsonRequest(`/api/budget/${budget.id}`, {
        method: 'PUT',
        body: { status: 'ARCHIVED' },
      }),
      { id: budget.id }
    )

    expect(esito.status).toBe(200)
    expect((await prisma.budget.findUniqueOrThrow({ where: { id: budget.id } })).status).toBe(
      'ARCHIVED'
    )
  })
})
