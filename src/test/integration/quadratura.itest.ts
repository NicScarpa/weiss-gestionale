import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc, romeDateKey } from '@/lib/timezone'
import { validateClosure } from '@/lib/services/closure-service'
import { aggregateCategoriesForBudget } from '@/lib/budget/category-aggregator'
import { GET as getSaldi } from '@/app/api/prima-nota/saldi/route'
import { GET as getCashflowSummary } from '@/app/api/cashflow/summary/route'
import { PUT as aggiornaChiusura } from '@/app/api/chiusure/[id]/route'
import { setupIntegrationDb } from './db'
import { loginAs } from './auth-mock'
import { jsonRequest, callRoute } from './api'
import { venueDiTest } from './fixtures/closures'

/**
 * Quadratura della contabilità: la domanda "quanti soldi abbiamo" deve avere
 * una sola risposta.
 *
 * Prima nota, budget e cash flow calcolavano il saldo ciascuno per conto
 * proprio — chi partendo dal saldo iniziale e chi da zero, chi includendo i
 * movimenti futuri e chi leggendo una tabella che nessun codice ha mai
 * scritto — e tre schermate dello stesso applicativo mostravano tre cifre
 * diverse per lo stesso giorno. Questo test non verifica una funzione: verifica
 * che le tre strade portino allo stesso numero, e resta nel gate perché è la
 * proprietà che si rompe per prima quando qualcuno aggiunge una quarta strada.
 *
 * Il dataset è scelto perché ogni cifra sia ricostruibile a mano: i valori
 * attesi qui sotto sono scritti come costanti, non ricalcolati con le stesse
 * formule del codice in prova (un test che rifà il calcolo dell'implementazione
 * conferma solo sé stesso).
 */
setupIntegrationDb()

/** Anno civile italiano in corso: è l'anno del saldo iniziale che conta. */
const ANNO = Number(romeDateKey(new Date()).slice(0, 4))

/**
 * La chiusura sta il 1° gennaio dell'anno in corso: sempre nel passato, sempre
 * dentro l'anno del saldo iniziale, qualunque sia il giorno in cui la suite
 * gira. Ancorarla a una data fissa avrebbe fatto scadere il test a capodanno.
 */
const GIORNO_CHIUSURA = toDateOnlyUtc(`${ANNO}-01-01`)
const OGGI = toDateOnlyUtc(romeDateKey(new Date()))
const FRA_UN_MESE = new Date(OGGI.getTime() + 30 * 24 * 60 * 60 * 1000)
const ANNO_SCORSO = toDateOnlyUtc(`${ANNO - 1}-12-31`)

// --- Dataset ---------------------------------------------------------------

const SALDO_INIZIALE_CASSA = 1000
const SALDO_INIZIALE_BANCA = 5000

const CONTANTI_IN_CASSA = 550
const INCASSO_POS = 200
const FONDO_CASSA = 114
const USCITA = 37.9

// --- Cifre attese ----------------------------------------------------------
//
// Incasso contanti registrato = 550 in cassa + 37,90 pagati con la cassa = 587,90
// Versamento in banca         = 550 − 114 di fondo − 37,90 di uscite   = 398,10
// Cassa   = 1.000 + 587,90 − 37,90 − 398,10 = 1.151,90
// Banca   = 5.000 + 200 di POS + 398,10 di versamento = 5.598,10
// Liquidità totale = 6.750,00

const CASSA_ATTESA = 1151.9
const BANCA_ATTESA = 5598.1
const LIQUIDITA_ATTESA = 6750

// Con 100 € di contanti in più: incasso 687,90 e versamento 498,10. In cassa
// resta quanto prima (1.151,90: i 100 € in più finiscono tutti in banca), la
// banca sale a 5.698,10.
const CONTANTI_CORRETTI = 650
const LIQUIDITA_DOPO_CORREZIONE = 6850

// --- Costruzione dello stato di partenza ------------------------------------

async function saldoInizialeDiApertura(venueId: string) {
  await prisma.initialBalance.create({
    data: {
      venueId,
      year: ANNO,
      cashBalance: SALDO_INIZIALE_CASSA,
      bankBalance: SALDO_INIZIALE_BANCA,
    },
  })
}

async function chiusuraValidata(venueId: string, userId: string, contanti = CONTANTI_IN_CASSA) {
  const closure = await prisma.dailyClosure.create({
    data: {
      venueId,
      date: GIORNO_CHIUSURA,
      status: 'SUBMITTED',
      submittedById: userId,
      submittedAt: new Date(),
      stations: {
        create: [
          {
            name: 'CASSA 1',
            position: 0,
            cashAmount: contanti,
            posAmount: INCASSO_POS,
            floatAmount: FONDO_CASSA,
          },
        ],
      },
      expenses: {
        create: [{ payee: 'Fornitore di prova', amount: USCITA, position: 0 }],
      },
    },
  })

  const esito = await validateClosure({ closureId: closure.id, userId, action: 'approve' })
  expect(esito.outcome).toBe('approved')

  return closure
}

/** Budget minimo: serve solo il contenitore, la liquidità non dipende dalle righe. */
async function budgetDellAnno(venueId: string) {
  return prisma.budget.create({ data: { venueId, year: ANNO, name: `Budget ${ANNO}` } })
}

// --- Le tre strade verso lo stesso numero ------------------------------------

interface SaldiPrimaNota {
  data: Array<{ cashBalance: number; bankBalance: number; totalAvailable: number }>
}

async function liquiditaDaPrimaNota(): Promise<SaldiPrimaNota['data'][number]> {
  const risposta = await callRoute<SaldiPrimaNota>(
    getSaldi,
    jsonRequest('/api/prima-nota/saldi')
  )

  expect(risposta.status).toBe(200)
  return risposta.body.data[0]
}

async function liquiditaDaCashFlow(): Promise<number> {
  const risposta = await callRoute<{ saldoAttuale: number }>(
    getCashflowSummary,
    jsonRequest('/api/cashflow/summary')
  )

  expect(risposta.status).toBe(200)
  return risposta.body.saldoAttuale
}

async function liquiditaDaBudget(budgetId: string, venueId: string): Promise<number> {
  const aggregato = await aggregateCategoriesForBudget(budgetId, venueId, ANNO)
  return aggregato.kpis.liquidity
}

describe('quadratura fra prima nota, budget e cash flow', () => {
  it('le tre strade danno la stessa liquidità dopo una chiusura validata', async () => {
    const sessione = await loginAs('admin')
    const venue = await venueDiTest()
    await saldoInizialeDiApertura(venue.id)
    const budget = await budgetDellAnno(venue.id)
    await chiusuraValidata(venue.id, sessione.user.id)

    const primaNota = await liquiditaDaPrimaNota()
    const cashFlow = await liquiditaDaCashFlow()
    const budgetLiquidita = await liquiditaDaBudget(budget.id, venue.id)

    expect(primaNota.cashBalance).toBe(CASSA_ATTESA)
    expect(primaNota.bankBalance).toBe(BANCA_ATTESA)
    expect(primaNota.totalAvailable).toBe(LIQUIDITA_ATTESA)
    expect(cashFlow).toBe(LIQUIDITA_ATTESA)
    expect(budgetLiquidita).toBe(LIQUIDITA_ATTESA)
  })

  // Una scadenza è una previsione, non un movimento: le regole dello scadenzario
  // datano le scritture al giorno in cui il denaro uscirà, e per un attimo il
  // saldo di oggi comprendeva anche il mese prossimo.
  it('un movimento datato nel futuro non cambia il saldo di oggi', async () => {
    const sessione = await loginAs('admin')
    const venue = await venueDiTest()
    await saldoInizialeDiApertura(venue.id)
    const budget = await budgetDellAnno(venue.id)
    await chiusuraValidata(venue.id, sessione.user.id)

    await prisma.journalEntry.create({
      data: {
        venueId: venue.id,
        date: FRA_UN_MESE,
        registerType: 'BANK',
        description: 'Affitto di fine mese, non ancora pagato',
        creditAmount: 2000,
      },
    })

    expect((await liquiditaDaPrimaNota()).totalAvailable).toBe(LIQUIDITA_ATTESA)
    expect(await liquiditaDaCashFlow()).toBe(LIQUIDITA_ATTESA)
    expect(await liquiditaDaBudget(budget.id, venue.id)).toBe(LIQUIDITA_ATTESA)
  })

  // Il saldo iniziale dell'anno è già il risultato dell'anno prima: sommargli
  // anche i movimenti di allora conta due volte la stessa storia.
  it("i movimenti dell'anno precedente sono già nel saldo iniziale e non si contano due volte", async () => {
    const sessione = await loginAs('admin')
    const venue = await venueDiTest()
    await saldoInizialeDiApertura(venue.id)
    const budget = await budgetDellAnno(venue.id)
    await chiusuraValidata(venue.id, sessione.user.id)

    await prisma.journalEntry.create({
      data: {
        venueId: venue.id,
        date: ANNO_SCORSO,
        registerType: 'BANK',
        description: "Incasso dell'ultimo giorno dell'anno scorso",
        debitAmount: 3000,
      },
    })

    expect((await liquiditaDaPrimaNota()).totalAvailable).toBe(LIQUIDITA_ATTESA)
    expect(await liquiditaDaCashFlow()).toBe(LIQUIDITA_ATTESA)
    expect(await liquiditaDaBudget(budget.id, venue.id)).toBe(LIQUIDITA_ATTESA)
  })

  // Correggere una chiusura già validata rigenera le sue scritture: se una sola
  // delle tre strade leggesse ancora quelle vecchie, la divergenza sarebbe
  // permanente e nessuna schermata direbbe quale cifra è quella giusta.
  it('la correzione di una chiusura validata lascia le tre strade allineate', async () => {
    const sessione = await loginAs('admin')
    const venue = await venueDiTest()
    await saldoInizialeDiApertura(venue.id)
    const budget = await budgetDellAnno(venue.id)
    const closure = await chiusuraValidata(venue.id, sessione.user.id)

    const correzione = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: {
          stations: [
            {
              name: 'CASSA 1',
              position: 0,
              cashAmount: CONTANTI_CORRETTI,
              posAmount: INCASSO_POS,
              floatAmount: FONDO_CASSA,
            },
          ],
          expenses: [{ payee: 'Fornitore di prova', amount: USCITA }],
        },
      }),
      { id: closure.id }
    )

    expect(correzione.status).toBe(200)

    const primaNota = await liquiditaDaPrimaNota()

    expect(primaNota.totalAvailable).toBe(LIQUIDITA_DOPO_CORREZIONE)
    expect(await liquiditaDaCashFlow()).toBe(LIQUIDITA_DOPO_CORREZIONE)
    expect(await liquiditaDaBudget(budget.id, venue.id)).toBe(LIQUIDITA_DOPO_CORREZIONE)
  })

  // Senza saldo iniziale l'apertura vale zero: la liquidità è tutta e sola
  // quella dei movimenti registrati, e le tre strade devono dirlo insieme.
  it('senza saldo iniziale le tre strade partono comunque dallo stesso zero', async () => {
    const sessione = await loginAs('admin')
    const venue = await venueDiTest()
    const budget = await budgetDellAnno(venue.id)
    await chiusuraValidata(venue.id, sessione.user.id)

    const movimentata = LIQUIDITA_ATTESA - SALDO_INIZIALE_CASSA - SALDO_INIZIALE_BANCA

    expect((await liquiditaDaPrimaNota()).totalAvailable).toBe(movimentata)
    expect(await liquiditaDaCashFlow()).toBe(movimentata)
    expect(await liquiditaDaBudget(budget.id, venue.id)).toBe(movimentata)
  })
})
