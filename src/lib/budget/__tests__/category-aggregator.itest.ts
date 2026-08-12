import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'
import { validateClosure } from '@/lib/services/closure-service'
import { aggregateCategoriesForBudget } from '@/lib/budget/category-aggregator'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { venueDiTest, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'

/**
 * Da dove vengono gli actual del budget.
 *
 * Prima venivano dalle uscite delle chiusure di cassa, e questo produceva due
 * effetti che il confronto budget/consuntivo non poteva sopravvivere: i costi
 * pagati per banca non comparivano affatto, e il totale dei ricavi veniva
 * *assegnato* a ogni categoria di ricavo invece di essere ripartito, così due
 * categorie mostravano due volte lo stesso fatturato. Entrambi sono verificati
 * qui sotto.
 */
setupIntegrationDb()

const ANNO = Number(romeDateKey(new Date()).slice(0, 4))
const GIORNO = `${ANNO}-01-01`

async function conto(code: string) {
  return prisma.account.findFirstOrThrow({ where: { code } })
}

async function categoria(
  venueId: string,
  valori: { code: string; categoryType: 'REVENUE' | 'COST'; contoId: string }
) {
  const budgetCategory = await prisma.budgetCategory.create({
    data: {
      venueId,
      code: valori.code,
      name: `Categoria ${valori.code}`,
      categoryType: valori.categoryType,
    },
  })

  await prisma.accountBudgetMapping.create({
    data: { accountId: valori.contoId, budgetCategoryId: budgetCategory.id },
  })

  return budgetCategory
}

async function movimento(
  venueId: string,
  valori: { accountId: string; entrata?: number; uscita?: number; giorno?: string }
) {
  return prisma.journalEntry.create({
    data: {
      venueId,
      date: toDateOnlyUtc(valori.giorno ?? GIORNO),
      registerType: 'BANK',
      description: 'Movimento di prova',
      debitAmount: valori.entrata ?? null,
      creditAmount: valori.uscita ?? null,
      accountId: valori.accountId,
    },
  })
}

async function budgetDellAnno(venueId: string) {
  return prisma.budget.create({ data: { venueId, year: ANNO, name: `Budget ${ANNO}` } })
}

/** Consuntivo annuo della categoria col codice indicato. */
function actualDi(
  risultato: Awaited<ReturnType<typeof aggregateCategoriesForBudget>>,
  code: string
): number {
  const trovata = risultato.categories.find((c) => c.code === code)
  if (!trovata) throw new Error(`Categoria ${code} assente dal risultato`)
  return trovata.actual.annual
}

describe('actual del budget', () => {
  it('conta i costi pagati per banca, che non passano da nessuna chiusura', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const budget = await budgetDellAnno(venue.id)
    const materiePrime = await conto('20.4.01')
    await categoria(venue.id, {
      code: 'C-MATERIE',
      categoryType: 'COST',
      contoId: materiePrime.id,
    })

    await movimento(venue.id, { accountId: materiePrime.id, uscita: 800 })

    const risultato = await aggregateCategoriesForBudget(budget.id, venue.id, ANNO)

    expect(actualDi(risultato, 'C-MATERIE')).toBe(800)
  })

  // La stessa uscita vive in due tabelle: la riga della chiusura e la scrittura
  // di prima nota che la validazione genera. Sommare entrambe raddoppierebbe
  // ogni costo di cassa.
  it("un'uscita di chiusura pesa una volta sola", async () => {
    const sessione = await loginAs('admin')
    const venue = await venueDiTest()
    const budget = await budgetDellAnno(venue.id)
    const materiePrime = await conto('20.4.01')
    await categoria(venue.id, {
      code: 'C-MATERIE',
      categoryType: 'COST',
      contoId: materiePrime.id,
    })

    const chiusura = await prisma.dailyClosure.create({
      data: {
        venueId: venue.id,
        date: toDateOnlyUtc(GIORNO),
        status: 'SUBMITTED',
        submittedById: sessione.user.id,
        submittedAt: new Date(),
        costCenterId: await centroDiCostoDiDefault(),
        stations: {
          create: [{ name: 'CASSA 1', position: 0, cashAmount: 300, floatAmount: 114 }],
        },
        expenses: {
          create: [
            {
              payee: 'Fornitore di prova',
              amount: 100,
              position: 0,
              accountId: materiePrime.id,
            },
          ],
        },
      },
    })

    const esito = await validateClosure({
      closureId: chiusura.id,
      userId: sessione.user.id,
      action: 'approve',
    })
    expect(esito.outcome).toBe('approved')

    const risultato = await aggregateCategoriesForBudget(budget.id, venue.id, ANNO)

    expect(actualDi(risultato, 'C-MATERIE')).toBe(100)
  })

  it('ogni categoria di ricavo mostra i propri conti, non il totale', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const budget = await budgetDellAnno(venue.id)
    const bar = await conto('10.01')
    const caffetteria = await conto('11.01')
    await categoria(venue.id, { code: 'R-BAR', categoryType: 'REVENUE', contoId: bar.id })
    await categoria(venue.id, {
      code: 'R-CAFFE',
      categoryType: 'REVENUE',
      contoId: caffetteria.id,
    })

    await movimento(venue.id, { accountId: bar.id, entrata: 300 })
    await movimento(venue.id, { accountId: caffetteria.id, entrata: 700 })

    const risultato = await aggregateCategoriesForBudget(budget.id, venue.id, ANNO)

    expect(actualDi(risultato, 'R-BAR')).toBe(300)
    expect(actualDi(risultato, 'R-CAFFE')).toBe(700)
  })

  // Uno storno riduce il costo del mese, non diventa un ricavo.
  it('un movimento di verso opposto riduce il consuntivo della categoria', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const budget = await budgetDellAnno(venue.id)
    const materiePrime = await conto('20.4.01')
    await categoria(venue.id, {
      code: 'C-MATERIE',
      categoryType: 'COST',
      contoId: materiePrime.id,
    })

    await movimento(venue.id, { accountId: materiePrime.id, uscita: 500 })
    await movimento(venue.id, { accountId: materiePrime.id, entrata: 120 })

    const risultato = await aggregateCategoriesForBudget(budget.id, venue.id, ANNO)

    expect(actualDi(risultato, 'C-MATERIE')).toBe(380)
  })

  it("i movimenti di un altro anno non entrano nel consuntivo dell'anno richiesto", async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    const budget = await budgetDellAnno(venue.id)
    const materiePrime = await conto('20.4.01')
    await categoria(venue.id, {
      code: 'C-MATERIE',
      categoryType: 'COST',
      contoId: materiePrime.id,
    })

    await movimento(venue.id, { accountId: materiePrime.id, uscita: 400 })
    await movimento(venue.id, {
      accountId: materiePrime.id,
      uscita: 999,
      giorno: `${ANNO - 1}-12-31`,
    })

    const risultato = await aggregateCategoriesForBudget(budget.id, venue.id, ANNO)

    expect(actualDi(risultato, 'C-MATERIE')).toBe(400)
  })

  // Dal piano v4 le scritture di chiusura nascono già imputate: l'incasso in
  // contanti finisce sempre sul conto di sistema Corrispettivi (RICAVO —
  // closure-journal-entries.ts, tabella "incasso contanti"). Il resto del
  // fatturato dichiarato — qui, quello non incassato in contanti, niente POS
  // in questo scenario — non ha invece nessun conto a sostenerlo: è quella
  // differenza residua che il test verifica, non più l'assenza totale di un
  // conto di ricavo.
  it('dichiara quanto fatturato non è imputato ad alcun conto di ricavo', async () => {
    const sessione = await loginAs('admin')
    const venue = await venueDiTest()
    const budget = await budgetDellAnno(venue.id)

    const fatturatoDichiarato = 1000
    const incassoContanti = 300

    const chiusura = await prisma.dailyClosure.create({
      data: {
        venueId: venue.id,
        date: toDateOnlyUtc(GIORNO),
        status: 'SUBMITTED',
        submittedById: sessione.user.id,
        submittedAt: new Date(),
        costCenterId: await centroDiCostoDiDefault(),
        stations: {
          create: [
            {
              name: 'CASSA 1',
              position: 0,
              receiptAmount: fatturatoDichiarato,
              cashAmount: incassoContanti,
              floatAmount: 114,
            },
          ],
        },
      },
    })

    await validateClosure({
      closureId: chiusura.id,
      userId: sessione.user.id,
      action: 'approve',
    })

    const risultato = await aggregateCategoriesForBudget(budget.id, venue.id, ANNO)

    expect(risultato.kpis.totalRevenue.annual).toBe(fatturatoDichiarato)
    // L'incasso contanti è già su Corrispettivi: resta non imputato solo il
    // fatturato dichiarato che quella scrittura non copre.
    expect(risultato.kpis.unassignedRevenue.annual).toBe(fatturatoDichiarato - incassoContanti)
  })
})
