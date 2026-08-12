import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'
import { aggregateCategoriesForBudget } from '@/lib/budget/category-aggregator'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as getConfronto } from '../route'

/**
 * Il confronto budget/consuntivo per conto.
 *
 * È la seconda faccia della stessa moneta di `category-aggregator`: gli stessi
 * numeri, raggruppati per conto invece che per categoria. Calcolava però gli
 * actual per conto suo — costi dalle uscite di chiusura (quindi senza le
 * fatture pagate per banca) e, per ogni conto di ricavo, il fatturato
 * complessivo assegnato invece che ripartito. Due schermate del modulo budget
 * mostravano numeri diversi sugli stessi dati.
 *
 * L'ultimo test è quello che conta davvero: le due strade devono coincidere.
 */
setupIntegrationDb()

const ANNO = Number(romeDateKey(new Date()).slice(0, 4))
const GIORNO = `${ANNO}-01-01`

interface Confronto {
  comparisons: Array<{
    accountId: string
    accountCode: string
    accountType: string
    actual: { annual: number }
  }>
  summary: {
    byType: Record<'RICAVO' | 'COSTO', { actual: number }>
  }
}

async function conto(code: string) {
  return prisma.account.findFirstOrThrow({ where: { code } })
}

async function movimento(
  venueId: string,
  valori: { accountId: string; entrata?: number; uscita?: number }
) {
  return prisma.journalEntry.create({
    data: {
      venueId,
      date: toDateOnlyUtc(GIORNO),
      registerType: 'BANK',
      description: 'Movimento di prova',
      debitAmount: valori.entrata ?? null,
      creditAmount: valori.uscita ?? null,
      accountId: valori.accountId,
    },
  })
}

/**
 * Budget con una riga per conto e la categoria che lo mappa: serve entrambe le
 * cose perché il confronto ragiona per conto e l'aggregatore per categoria.
 *
 * Il tipo di categoria segue il tipo vero del conto (RICAVO/COSTO), non più
 * una convenzione sul codice: il piano v4 non riserva più i codici che
 * cominciano per "4" ai ricavi.
 */
async function budgetConConti(
  venueId: string,
  conti: Array<{ id: string; code: string; type: string }>
) {
  const budget = await prisma.budget.create({
    data: { venueId, year: ANNO, name: `Budget ${ANNO}` },
  })

  for (const c of conti) {
    await prisma.budgetLine.create({ data: { budgetId: budget.id, accountId: c.id } })

    const categoria = await prisma.budgetCategory.create({
      data: {
        venueId,
        code: `CAT-${c.code}`,
        name: `Categoria ${c.code}`,
        categoryType: c.type === 'RICAVO' ? 'REVENUE' : 'COST',
      },
    })

    await prisma.accountBudgetMapping.create({
      data: { accountId: c.id, budgetCategoryId: categoria.id },
    })
  }

  return budget
}

async function confronto(): Promise<Confronto> {
  const risposta = await callRoute<Confronto>(
    getConfronto,
    jsonRequest('/api/budget/confronto', { searchParams: { year: String(ANNO) } })
  )

  expect(risposta.status).toBe(200)
  return risposta.body
}

function actualDelConto(dati: Confronto, code: string): number {
  const riga = dati.comparisons.find((c) => c.accountCode === code)
  if (!riga) throw new Error(`Conto ${code} assente dal confronto`)
  return riga.actual.annual
}

describe('GET /api/budget/confronto', () => {
  it('conta i costi pagati per banca, che non passano da nessuna chiusura', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const materiePrime = await conto('20.4.01')
    await budgetConConti(venue.id, [materiePrime])
    await movimento(venue.id, { accountId: materiePrime.id, uscita: 800 })

    expect(actualDelConto(await confronto(), '20.4.01')).toBe(800)
  })

  it('ogni conto di ricavo mostra i propri movimenti, non il fatturato totale', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const bar = await conto('10.01')
    const caffetteria = await conto('11.01')
    await budgetConConti(venue.id, [bar, caffetteria])

    await movimento(venue.id, { accountId: bar.id, entrata: 300 })
    await movimento(venue.id, { accountId: caffetteria.id, entrata: 700 })

    const dati = await confronto()

    expect(actualDelConto(dati, '10.01')).toBe(300)
    expect(actualDelConto(dati, '11.01')).toBe(700)
    expect(dati.summary.byType.RICAVO.actual).toBe(1000)
  })

  it('uno storno riduce il consuntivo del conto invece di gonfiare i ricavi', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const materiePrime = await conto('20.4.01')
    await budgetConConti(venue.id, [materiePrime])

    await movimento(venue.id, { accountId: materiePrime.id, uscita: 500 })
    await movimento(venue.id, { accountId: materiePrime.id, entrata: 120 })

    expect(actualDelConto(await confronto(), '20.4.01')).toBe(380)
  })

  // La prova che le due strade sono la stessa strada.
  it("dà gli stessi actual dell'aggregatore per categoria, sullo stesso dataset", async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const bar = await conto('10.01')
    const caffetteria = await conto('11.01')
    const materiePrime = await conto('20.4.01')
    const budget = await budgetConConti(venue.id, [bar, caffetteria, materiePrime])

    await movimento(venue.id, { accountId: bar.id, entrata: 300 })
    await movimento(venue.id, { accountId: caffetteria.id, entrata: 700 })
    await movimento(venue.id, { accountId: materiePrime.id, uscita: 450 })

    const dati = await confronto()
    const aggregato = await aggregateCategoriesForBudget(budget.id, venue.id, ANNO)

    for (const code of ['10.01', '11.01', '20.4.01']) {
      const categoria = aggregato.categories.find((c) => c.code === `CAT-${code}`)!
      expect(actualDelConto(dati, code)).toBe(categoria.actual.annual)
    }
  })

  it('senza sessione risponde 401', async () => {
    const risposta = await callRoute(
      getConfronto,
      jsonRequest('/api/budget/confronto', { searchParams: { year: String(ANNO) } })
    )

    expect(risposta.status).toBe(401)
  })
})
