import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente, giornoIndietro } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'
import { POST as eseguiPagamento } from '@/app/api/pagamenti/[id]/esegui/route'
import { GET as getProjection } from '../route'

/**
 * La curva del cash flow.
 *
 * Aveva i segni scambiati: leggeva `creditAmount` come entrata e `debitAmount`
 * come uscita, l'esatto contrario della convenzione del progetto. Un bonifico
 * in uscita faceva quindi *salire* la linea del saldo. In più il progressivo
 * partiva da zero, così il grafico e la card "Saldo Attuale" della stessa
 * pagina mostravano due quote diverse dello stesso denaro.
 */
setupIntegrationDb()

const OGGI = giornoCorrente()
const ANNO = Number(OGGI.slice(0, 4))

interface PuntoProiezione {
  data: string
  saldo: number
  entrata: number
  uscita: number
}

async function saldoDiApertura(venueId: string, banca: number) {
  await prisma.initialBalance.create({
    data: { venueId, year: ANNO, cashBalance: 0, bankBalance: banca },
  })
}

async function movimento(
  venueId: string,
  valori: { giorno?: string; entrata?: number; uscita?: number }
) {
  return prisma.journalEntry.create({
    data: {
      venueId,
      date: toDateOnlyUtc(valori.giorno ?? OGGI),
      registerType: 'BANK',
      description: 'Movimento di prova',
      debitAmount: valori.entrata ?? null,
      creditAmount: valori.uscita ?? null,
      costCenterId: await centroDiCostoDiDefault(),
    },
  })
}

async function proiezione(searchParams: Record<string, string> = {}) {
  const risposta = await callRoute<PuntoProiezione[]>(
    getProjection,
    jsonRequest('/api/cashflow/projection', {
      searchParams: { from: OGGI, days: '30', ...searchParams },
    })
  )

  expect(risposta.status).toBe(200)
  return risposta.body
}

describe('GET /api/cashflow/projection', () => {
  // La richiesta è quella dell'audit: un pagamento è denaro che esce, e la
  // linea del saldo deve scendere.
  it('un pagamento eseguito abbassa il saldo proiettato', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await saldoDiApertura(venue.id, 5000)

    const pagamento = await prisma.payment.create({
      data: {
        venueId: venue.id,
        tipo: 'BONIFICO',
        stato: 'DA_APPROVARE',
        dataEsecuzione: toDateOnlyUtc(OGGI),
        importo: 1200,
        beneficiarioNome: 'Fornitore di prova',
      },
    })

    const esito = await callRoute(
      eseguiPagamento,
      jsonRequest(`/api/pagamenti/${pagamento.id}/esegui`, { method: 'POST' }),
      { id: pagamento.id }
    )
    expect(esito.status).toBe(200)

    const punti = await proiezione()

    expect(punti.at(-1)!.saldo).toBe(3800)
    expect(punti.at(-1)!.uscita).toBe(1200)
    expect(punti.at(-1)!.entrata).toBe(0)
  })

  it('un incasso alza il saldo proiettato', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await saldoDiApertura(venue.id, 5000)
    await movimento(venue.id, { entrata: 400 })

    const punti = await proiezione()

    expect(punti.at(-1)!.saldo).toBe(5400)
    expect(punti.at(-1)!.entrata).toBe(400)
    expect(punti.at(-1)!.uscita).toBe(0)
  })

  // Il grafico e la card del saldo stanno sulla stessa pagina: partire da zero
  // significava disegnare la curva giusta alla quota sbagliata.
  it('parte dal saldo reale alla vigilia della finestra, non da zero', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await saldoDiApertura(venue.id, 5000)
    await movimento(venue.id, { giorno: giornoIndietro(OGGI, 10), uscita: 500 })
    await movimento(venue.id, { entrata: 100 })

    const punti = await proiezione()

    // 5.000 di apertura − 500 già usciti prima della finestra = 4.500, poi +100.
    expect(punti).toHaveLength(1)
    expect(punti[0].saldo).toBe(4600)
  })

  it('somma in un solo punto i movimenti dello stesso giorno', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await saldoDiApertura(venue.id, 1000)
    await movimento(venue.id, { entrata: 200 })
    await movimento(venue.id, { uscita: 50 })

    const punti = await proiezione()

    expect(punti).toHaveLength(1)
    expect(punti[0].entrata).toBe(200)
    expect(punti[0].uscita).toBe(50)
    expect(punti[0].saldo).toBe(1150)
  })

  it('esclude i movimenti oltre la finestra richiesta', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await saldoDiApertura(venue.id, 1000)
    await movimento(venue.id, { entrata: 200 })
    await movimento(venue.id, { giorno: `${ANNO + 1}-12-31`, entrata: 9999 })

    const punti = await proiezione({ days: '7' })

    expect(punti).toHaveLength(1)
    expect(punti[0].saldo).toBe(1200)
  })

  it('senza sessione risponde 401', async () => {
    const risposta = await callRoute(
      getProjection,
      jsonRequest('/api/cashflow/projection')
    )

    expect(risposta.status).toBe(401)
  })
})
