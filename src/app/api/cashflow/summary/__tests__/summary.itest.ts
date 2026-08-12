import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente, giornoIndietro } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'
import { GET as getSummary } from '../route'

/**
 * Le card in testa alla pagina Cash Flow.
 *
 * Questa route rispondeva 500 a ogni caricamento — leggeva una tabella di
 * appoggio con un cast a `uuid` su identificatori che sono cuid — e la pagina
 * mostrava "0,00 €" e "Runway 0.0 mesi" come se fossero dati veri. Le
 * asserzioni qui sotto valgono per quello che verificano e per il fatto stesso
 * che la route risponda 200.
 */
setupIntegrationDb()

const OGGI = giornoCorrente()

interface Summary {
  saldoAttuale: number
  trend7gg: number
  previsione30gg: number
  deltaPrevisione: number
  runwayMesi: number
  burnRateMensile: number
  prossimoAlert: { tipo: string } | null
}

async function movimento(
  venueId: string,
  valori: { giorniFa: number; entrata?: number; uscita?: number }
) {
  return prisma.journalEntry.create({
    data: {
      venueId,
      date: toDateOnlyUtc(giornoIndietro(OGGI, valori.giorniFa)),
      registerType: 'BANK',
      description: 'Movimento di prova',
      debitAmount: valori.entrata ?? null,
      creditAmount: valori.uscita ?? null,
      costCenterId: await centroDiCostoDiDefault(),
    },
  })
}

async function summary(): Promise<Summary> {
  const risposta = await callRoute<Summary>(getSummary, jsonRequest('/api/cashflow/summary'))
  expect(risposta.status).toBe(200)
  return risposta.body
}

describe('GET /api/cashflow/summary', () => {
  it('risponde con il saldo calcolato dai movimenti', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await movimento(venue.id, { giorniFa: 10, entrata: 500 })

    expect((await summary()).saldoAttuale).toBe(500)
  })

  // Trend = differenza fra due saldi puntuali. Prima si sottraeva a un saldo la
  // *somma* dei saldi di sette giorni: due grandezze diverse, un numero senza
  // significato.
  it('il trend a sette giorni è la differenza fra due saldi', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await movimento(venue.id, { giorniFa: 10, entrata: 500 })
    await movimento(venue.id, { giorniFa: 3, entrata: 200 })

    const dati = await summary()

    expect(dati.saldoAttuale).toBe(700)
    expect(dati.trend7gg).toBe(200)
  })

  // La previsione è un saldo futuro, il delta è la variazione che ci porta:
  // erano la stessa identica espressione, e la card mostrava due volte lo
  // stesso numero con due significati diversi.
  it('previsione e delta non sono lo stesso numero', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await movimento(venue.id, { giorniFa: 10, entrata: 600 })

    const dati = await summary()

    expect(dati.deltaPrevisione).toBe(600)
    expect(dati.previsione30gg).toBe(dati.saldoAttuale + dati.deltaPrevisione)
  })

  it('con andamento positivo non si brucia cassa e il runway non ha limite', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await movimento(venue.id, { giorniFa: 5, entrata: 900 })

    const dati = await summary()

    expect(dati.burnRateMensile).toBe(0)
    expect(dati.runwayMesi).toBe(999)
  })

  it('con andamento negativo il runway sono i mesi che il saldo copre', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await prisma.initialBalance.create({
      data: {
        venueId: venue.id,
        year: Number(OGGI.slice(0, 4)),
        cashBalance: 0,
        bankBalance: 3000,
      },
    })
    await movimento(venue.id, { giorniFa: 5, uscita: 600 })

    const dati = await summary()

    expect(dati.saldoAttuale).toBe(2400)
    expect(dati.burnRateMensile).toBe(600)
    expect(dati.runwayMesi).toBe(4)
  })

  // Una scadenza registrata dalle regole porta la data del giorno in cui il
  // denaro uscirà: oggi non è ancora uscito niente.
  it('un movimento datato nel futuro non entra nel saldo attuale', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await movimento(venue.id, { giorniFa: 5, entrata: 500 })
    await movimento(venue.id, { giorniFa: -20, uscita: 400 })

    expect((await summary()).saldoAttuale).toBe(500)
  })

  it('senza sessione risponde 401', async () => {
    const risposta = await callRoute(getSummary, jsonRequest('/api/cashflow/summary'))

    expect(risposta.status).toBe(401)
  })
})
