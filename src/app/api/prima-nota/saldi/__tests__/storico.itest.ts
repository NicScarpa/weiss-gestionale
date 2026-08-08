import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente, giornoIndietro } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as getSaldi } from '../route'
import { GET as getStorico } from '../storico/route'

/**
 * Lo storico dei saldi deve finire dove il saldo corrente comincia.
 *
 * Il progressivo partiva da zero e ignorava sia il saldo iniziale sia tutto ciò
 * che precedeva la finestra richiesta: la curva aveva la forma giusta alla
 * quota sbagliata, e l'ultimo punto non coincideva mai con la cifra mostrata
 * dalle card della prima nota.
 */
setupIntegrationDb()

const ANNO = Number(romeDateKey(new Date()).slice(0, 4))
const OGGI = giornoCorrente()

interface RegistroDelPeriodo {
  openingBalance: number
  closingBalance: number
  debits: number
  credits: number
  movementCount: number
}

interface RispostaStorico {
  data: Array<{
    period: string
    registers: Record<string, RegistroDelPeriodo>
    totalAvailable: number
  }>
}

async function statoDiPartenza() {
  const venue = await venueDiTest()

  await prisma.initialBalance.create({
    data: { venueId: venue.id, year: ANNO, cashBalance: 0, bankBalance: 1000 },
  })

  for (const [giorno, importo] of [
    [`${ANNO}-01-01`, 250],
    [OGGI, 50],
  ] as const) {
    await prisma.journalEntry.create({
      data: {
        venueId: venue.id,
        date: toDateOnlyUtc(giorno),
        registerType: 'BANK',
        description: 'Movimento di prova',
        debitAmount: importo,
      },
    })
  }

  return venue
}

async function storico(searchParams: Record<string, string> = {}) {
  const risposta = await callRoute<RispostaStorico>(
    getStorico,
    jsonRequest('/api/prima-nota/saldi/storico', { searchParams })
  )

  expect(risposta.status).toBe(200)
  return risposta.body.data
}

describe('GET /api/prima-nota/saldi/storico', () => {
  it("chiude sullo stesso saldo che risponde l'endpoint dei saldi", async () => {
    await loginAs('admin')
    await statoDiPartenza()

    const periodi = await storico()
    const saldi = await callRoute<{ data: Array<{ totalAvailable: number }> }>(
      getSaldi,
      jsonRequest('/api/prima-nota/saldi')
    )

    expect(periodi.at(-1)!.totalAvailable).toBe(saldi.body.data[0].totalAvailable)
    expect(periodi.at(-1)!.totalAvailable).toBe(1300)
  })

  // Filtrare per data cambia la finestra osservata, non la storia: il primo
  // periodo si apre col saldo che c'era davvero alla vigilia.
  it('apre la finestra filtrata col saldo reale del giorno prima', async () => {
    await loginAs('admin')
    await statoDiPartenza()

    const periodi = await storico({ dateFrom: OGGI })

    expect(periodi).toHaveLength(1)
    expect(periodi[0].registers.BANK.openingBalance).toBe(1250)
    expect(periodi[0].registers.BANK.closingBalance).toBe(1300)
  })

  it('raggruppa per mese quando richiesto', async () => {
    await loginAs('admin')
    await statoDiPartenza()

    const periodi = await storico({ groupBy: 'month', dateFrom: `${ANNO}-01-01` })

    expect(periodi[0].period).toBe(`${ANNO}-01`)
    expect(periodi[0].registers.BANK.debits).toBe(250)
  })

  it('esclude i movimenti oltre la data finale', async () => {
    await loginAs('admin')
    await statoDiPartenza()

    const periodi = await storico({ dateTo: giornoIndietro(OGGI, 1) })

    expect(periodi.at(-1)!.totalAvailable).toBe(1250)
  })

  it('rifiuta una data malformata', async () => {
    await loginAs('admin')
    await statoDiPartenza()

    const risposta = await callRoute(
      getStorico,
      jsonRequest('/api/prima-nota/saldi/storico', { searchParams: { dateFrom: 'ieri' } })
    )

    expect(risposta.status).toBe(400)
  })

  it('senza sessione risponde 401', async () => {
    const risposta = await callRoute(
      getStorico,
      jsonRequest('/api/prima-nota/saldi/storico')
    )

    expect(risposta.status).toBe(401)
  })
})
