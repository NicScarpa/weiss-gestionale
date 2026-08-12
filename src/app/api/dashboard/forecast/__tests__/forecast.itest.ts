import { describe, it, expect } from 'vitest'
import { addDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente, giornoIndietro } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { GET as getForecast } from '../route'
import { GET as getSummary } from '@/app/api/cashflow/summary/route'
import { GET as getSaldiPrimaNota } from '@/app/api/prima-nota/saldi/route'

/**
 * La previsione di cassa a trenta giorni, quella che alimenta il pannello
 * «Come nasce la previsione».
 *
 * Il punto di questi test è che il saldo da cui la previsione parte sia lo
 * stesso numero mostrato dalla card «Saldo Attuale», a un centimetro di
 * distanza sullo schermo. Questa route se lo calcolava per conto suo — tutti i
 * movimenti di sempre sommati al saldo iniziale dell'anno in corso, movimenti
 * nascosti compresi — mentre le card passano da `@/lib/saldi`.
 */
setupIntegrationDb()

const OGGI = giornoCorrente()

interface RispostaForecast {
  currentBalance: { cash: number; bank: number; total: number }
  forecast: Array<{
    date: string
    expectedExpenses: number
    projectedBalance: number
    expenses: Array<{ name: string; amount: number }>
  }>
  summary: { totalExpectedExpenses: number; totalExpectedIncome: number }
}

async function movimento(
  venueId: string,
  valori: { giorniFa: number; entrata?: number; uscita?: number; nascosto?: boolean }
) {
  return prisma.journalEntry.create({
    data: {
      venueId,
      date: toDateOnlyUtc(giornoIndietro(OGGI, valori.giorniFa)),
      registerType: 'BANK',
      description: 'Movimento di prova',
      debitAmount: valori.entrata ?? null,
      creditAmount: valori.uscita ?? null,
      hiddenAt: valori.nascosto ? new Date() : null,
    },
  })
}

async function previsione(giorni = 30): Promise<RispostaForecast> {
  const risposta = await callRoute<RispostaForecast>(
    getForecast,
    jsonRequest('/api/dashboard/forecast', { searchParams: { days: giorni } })
  )
  expect(risposta.status).toBe(200)
  return risposta.body
}

async function saldoDelleCard(): Promise<number> {
  const risposta = await callRoute<{ saldoAttuale: number }>(
    getSummary,
    jsonRequest('/api/cashflow/summary')
  )
  expect(risposta.status).toBe(200)
  return risposta.body.saldoAttuale
}

/** Il saldo della prima nota: la risposta di riferimento a «quanti soldi abbiamo». */
async function saldoDellaPrimaNota(): Promise<{ cash: number; bank: number; total: number }> {
  const risposta = await callRoute<{
    data: Array<{ cashBalance: number; bankBalance: number; totalAvailable: number }>
  }>(getSaldiPrimaNota, jsonRequest('/api/prima-nota/saldi'))
  expect(risposta.status).toBe(200)
  const saldi = risposta.body.data[0]
  return { cash: saldi.cashBalance, bank: saldi.bankBalance, total: saldi.totalAvailable }
}

/**
 * Il dataset di una prima nota vera: un anno già chiuso alle spalle, il saldo
 * iniziale dell'anno in corso che lo riassume, un movimento nascosto e una
 * scadenza registrata al giorno futuro in cui il denaro uscirà.
 *
 * È su questa forma che il vecchio conteggio divergeva, e di parecchio: al
 * saldo iniziale del 2026 sommava anche i movimenti del 2025 — già compresi in
 * quel saldo, quindi contati due volte — più i nascosti, e sottraeva già oggi
 * le uscite datate domani.
 */
async function primaNotaRealistica(venueId: string) {
  const anno = Number(OGGI.slice(0, 4))

  await prisma.initialBalance.create({
    data: { venueId, year: anno, cashBalance: 2000, bankBalance: 18000 },
  })

  for (const importo of [12000, 9500, 7300]) {
    await prisma.journalEntry.create({
      data: {
        venueId,
        date: toDateOnlyUtc(`${anno - 1}-06-15`),
        registerType: 'BANK',
        description: 'Incasso anno precedente',
        debitAmount: importo,
      },
    })
  }

  await movimento(venueId, { giorniFa: 20, entrata: 4200 })
  await movimento(venueId, { giorniFa: 12, uscita: 1600 })
  await movimento(venueId, { giorniFa: 6, entrata: 3100, nascosto: true })
  await movimento(venueId, { giorniFa: -15, uscita: 5400 })
}

describe('GET /api/dashboard/forecast', () => {
  // Tre route, una sola risposta alla domanda «quanti soldi abbiamo». Prima del
  // fix questa era l'unica a dare un numero diverso dalle altre due: 49.100 €
  // contro i 22.600 € reali, cioè 26.500 € di troppo.
  it('parte dallo stesso saldo di /api/prima-nota/saldi su una prima nota realistica', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await primaNotaRealistica(venue.id)

    const dati = await previsione()
    const primaNota = await saldoDellaPrimaNota()

    // 20.000 di apertura + 4.200 − 1.600: né il 2025, né il nascosto, né la
    // scadenza del mese prossimo.
    expect(dati.currentBalance.total).toBe(22600)
    expect(dati.currentBalance.total).toBe(primaNota.total)
    expect(dati.currentBalance.total).toBe(await saldoDelleCard())
  })

  it('cassa e banca coincidono voce per voce, non solo nel totale', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await primaNotaRealistica(venue.id)

    const dati = await previsione()
    const primaNota = await saldoDellaPrimaNota()

    expect(dati.currentBalance.cash).toBe(primaNota.cash)
    expect(dati.currentBalance.bank).toBe(primaNota.bank)
  })

  it('parte dallo stesso saldo che mostrano le card del cash flow', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await prisma.initialBalance.create({
      data: {
        venueId: venue.id,
        year: Number(OGGI.slice(0, 4)),
        cashBalance: 500,
        bankBalance: 2000,
      },
    })
    await movimento(venue.id, { giorniFa: 10, entrata: 800 })
    await movimento(venue.id, { giorniFa: 3, uscita: 300 })

    const dati = await previsione()

    expect(dati.currentBalance.total).toBe(await saldoDelleCard())
    expect(dati.currentBalance.total).toBe(3000)
  })

  // Nascondere un movimento serve a toglierlo dai conti: se pesa ancora sulla
  // previsione, le due schermate raccontano due storie diverse.
  it('un movimento nascosto non entra nel saldo di partenza', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await movimento(venue.id, { giorniFa: 5, entrata: 1000 })
    await movimento(venue.id, { giorniFa: 4, entrata: 700, nascosto: true })

    const dati = await previsione()

    expect(dati.currentBalance.total).toBe(1000)
    expect(dati.currentBalance.total).toBe(await saldoDelleCard())
  })

  // Una scadenza registrata dalle regole porta la data del giorno in cui il
  // denaro uscirà: oggi quel denaro non è ancora uscito.
  it('un movimento datato nel futuro non entra nel saldo di partenza', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await movimento(venue.id, { giorniFa: 5, entrata: 900 })
    await movimento(venue.id, { giorniFa: -10, uscita: 400 })

    expect((await previsione()).currentBalance.total).toBe(900)
  })

  it('le spese ricorrenti attive compaiono fra le uscite previste', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const sessione = await prisma.user.findFirstOrThrow({ where: { role: { name: 'admin' } } })
    await prisma.recurringExpense.create({
      data: {
        venueId: venue.id,
        name: 'Affitto locale',
        amount: 1200,
        frequency: 'DAILY',
        createdBy: sessione.id,
      },
    })

    const dati = await previsione(30)

    expect(dati.summary.totalExpectedExpenses).toBeGreaterThan(0)
    expect(dati.forecast[0].expenses.map((e) => e.name)).toContain('Affitto locale')
  })

  // Il mese di una spesa annuale è quello da cui è attiva. Prima era sempre
  // gennaio, scritto a mano nel codice: un'assicurazione che si paga a
  // settembre spariva dalla previsione di settembre e ricompariva a gennaio.
  it('una spesa annuale cade nel mese da cui è attiva', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const autore = await prisma.user.findFirstOrThrow({ where: { role: { name: 'admin' } } })
    const fraUnMese = new Date(Date.UTC(2026, 8, 10)) // 10 settembre 2026
    await prisma.recurringExpense.create({
      data: {
        venueId: venue.id,
        name: 'Assicurazione',
        amount: 2400,
        frequency: 'YEARLY',
        dayOfMonth: 10,
        startDate: new Date(Date.UTC(2025, 8, 10)),
        createdBy: autore.id,
      },
    })

    const dati = await previsione(90)
    const giornoDellaSpesa = dati.forecast.find((g) =>
      g.expenses.some((e) => e.name === 'Assicurazione')
    )

    expect(giornoDellaSpesa?.date).toBe(fraUnMese.toISOString().slice(0, 10))
  })

  it('una spesa trimestrale cade ogni tre mesi a partire dal mese di attivazione', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const autore = await prisma.user.findFirstOrThrow({ where: { role: { name: 'admin' } } })
    await prisma.recurringExpense.create({
      data: {
        venueId: venue.id,
        name: 'Consulenza',
        amount: 900,
        frequency: 'QUARTERLY',
        dayOfMonth: 20,
        startDate: new Date(Date.UTC(2026, 1, 20)), // 20 febbraio: feb, mag, ago, nov
        createdBy: autore.id,
      },
    })

    const dati = await previsione(90)
    const giorni = dati.forecast
      .filter((g) => g.expenses.some((e) => e.name === 'Consulenza'))
      .map((g) => g.date)

    // La finestra va da domani a novanta giorni: dentro ci sta il 20 agosto
    // (febbraio + due trimestri), non il 20 ottobre dei mesi fissi di prima.
    expect(giorni).toContain('2026-08-20')
    expect(giorni).not.toContain('2026-10-20')
  })

  it('una spesa sospesa non pesa sulla previsione', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const sessione = await prisma.user.findFirstOrThrow({ where: { role: { name: 'admin' } } })
    await prisma.recurringExpense.create({
      data: {
        venueId: venue.id,
        name: 'Canone sospeso',
        amount: 500,
        frequency: 'DAILY',
        isActive: false,
        createdBy: sessione.id,
      },
    })

    expect((await previsione()).summary.totalExpectedExpenses).toBe(0)
  })

  // `CashFlowSourcePanel` mostra questa somma a schermo come una catena di
  // quattro numeri affiancati: «Liquidità di oggi + Incassi attesi − Spese
  // ricorrenti = Saldo previsto». Da quando `projectedBalance` viene dalla
  // serie unificata (scadenze e ricorrenze comprese, non più solo la stima
  // storica e le spese ricorrenti), l'identità regge solo se anche
  // `totalExpectedIncome`/`totalExpectedExpenses` vengono dalla stessa serie.
  // Se un domani qualcuno restringe di nuovo uno dei due termini alla vecchia
  // fonte (solo stima, solo `RecurringExpense`), questo test si rompe in
  // rosso invece che a schermo.
  it("l'identità mostrata dal pannello regge: apertura + incassi attesi − spese attese = saldo finale previsto", async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const autore = await prisma.user.findFirstOrThrow({ where: { role: { name: 'admin' } } })

    await prisma.initialBalance.create({
      data: {
        venueId: venue.id,
        year: Number(OGGI.slice(0, 4)),
        cashBalance: 500,
        bankBalance: 2000,
      },
    })

    // Una spesa ricorrente (fonte `ricorrente`)...
    await prisma.recurringExpense.create({
      data: {
        venueId: venue.id,
        name: 'Canone',
        amount: 150,
        frequency: 'DAILY',
        createdBy: autore.id,
      },
    })

    // ...e una scadenza reale (fonte `scadenza`), nella finestra: prima del
    // fix, solo la prima pesava su `expectedIncome`/`expectedExpenses`.
    await creaScadenza({
      venueId: venue.id,
      importoTotale: 400,
      tipo: 'attiva',
      dataScadenza: addDays(toDateOnlyUtc(OGGI), 10),
    })

    const dati = await previsione(30)

    // L'identità è vera per costruzione qualunque sia il valore dei termini:
    // resterebbe verde anche se né la scadenza né la spesa entrassero nella
    // finestra, cioè proprio nel caso in cui non garantisce più nulla. Senza
    // queste due righe il test non accorgerebbe una regressione che azzera
    // silenziosamente uno dei due termini.
    expect(dati.summary.totalExpectedExpenses).toBeGreaterThan(0)
    expect(dati.summary.totalExpectedIncome).toBeGreaterThan(0)

    const atteso =
      dati.currentBalance.total + dati.summary.totalExpectedIncome - dati.summary.totalExpectedExpenses

    expect(dati.forecast.at(-1)!.projectedBalance).toBeCloseTo(atteso, 2)
  })
})
