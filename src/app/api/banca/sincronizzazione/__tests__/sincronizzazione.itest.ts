import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { GET as statoGET, POST as sincronizzaPOST } from '../route'
import { GET as cronGET } from '../cron/route'

setupIntegrationDb()

const SEGRETO = 'segreto-di-prova'

function clientFinto(): ClientGoCardless {
  return {
    movimentiConto: vi.fn(async () => ({
      dati: {
        transactions: {
          booked: [
            {
              transactionId: '20260810-1',
              bookingDate: '2026-08-10',
              transactionAmount: { amount: '-12.50', currency: 'EUR' },
              remittanceInformationUnstructured: 'PAGAMENTO POS',
            },
          ],
          pending: [],
        },
      },
      limiti: { restanti: 3, ripresaFraSecondi: null },
    })),
  } as unknown as ClientGoCardless
}

async function montaConto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const connessione =
    (await prisma.bankConnection.findFirst({ where: { venueId: venue.id } })) ??
    (await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_MARCA',
        institutionName: 'Banca della Marca',
        requisitionId: `req-${venue.id}`,
        status: 'LN',
      },
    }))
  return prisma.bankAccount.create({
    data: {
      venueId: venue.id,
      name: 'Banca della Marca',
      accountType: 'BANK',
      connectionId: connessione.id,
      providerAccountId: 'acct-1',
      syncEnabled: true,
    },
  })
}

describe('il cron della sincronizzazione', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SEGRETO
    logout()
  })
  afterEach(() => impostaClientPerTest(null))

  it('senza segreto risponde 401', async () => {
    const r = await callRoute(cronGET, jsonRequest('http://localhost/api/banca/sincronizzazione/cron'))
    expect(r.status).toBe(401)
  })

  it('col segreto sbagliato risponde 401', async () => {
    const r = await callRoute(
      cronGET,
      jsonRequest('http://localhost/api/banca/sincronizzazione/cron', {
        headers: { authorization: 'Bearer sbagliato' },
      })
    )
    expect(r.status).toBe(401)
  })

  it('col segreto giusto sincronizza i conti accesi', async () => {
    const conto = await montaConto()
    impostaClientPerTest(clientFinto())

    const r = await callRoute(
      cronGET,
      jsonRequest('http://localhost/api/banca/sincronizzazione/cron', {
        headers: { authorization: `Bearer ${SEGRETO}` },
      })
    )

    expect(r.status).toBe(200)
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: conto.id } })).toBe(1)
  })
})

describe('«Sincronizza ora»', () => {
  beforeEach(() => logout())
  afterEach(() => impostaClientPerTest(null))

  it('senza sessione risponde 401', async () => {
    const r = await callRoute(
      sincronizzaPOST,
      jsonRequest('http://localhost/api/banca/sincronizzazione', { method: 'POST', body: {} })
    )
    expect(r.status).toBe(401)
  })

  it('come staff risponde 403', async () => {
    await entraCome('staff')
    const r = await callRoute(
      sincronizzaPOST,
      jsonRequest('http://localhost/api/banca/sincronizzazione', { method: 'POST', body: {} })
    )
    expect(r.status).toBe(403)
  })

  it('come admin sincronizza', async () => {
    const conto = await montaConto()
    await entraCome('admin')
    impostaClientPerTest(clientFinto())

    const r = await callRoute(
      sincronizzaPOST,
      jsonRequest('http://localhost/api/banca/sincronizzazione', { method: 'POST', body: {} })
    )

    expect(r.status).toBe(200)
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: conto.id } })).toBe(1)
  })
})

describe('lo stato della sincronizzazione', () => {
  beforeEach(() => logout())

  it('senza sessione risponde 401', async () => {
    const r = await callRoute(statoGET, jsonRequest('http://localhost/api/banca/sincronizzazione'))
    expect(r.status).toBe(401)
  })

  it('dice quante sincronizzazioni restano e se il canale mail è configurato', async () => {
    await montaConto()
    await entraCome('admin')
    delete process.env.RESEND_API_KEY

    const r = await callRoute<{
      conti: Array<{ sincronizzazioniRimaste: number; ultimaRiuscita: string | null }>
      mailConfigurata: boolean
    }>(statoGET, jsonRequest('http://localhost/api/banca/sincronizzazione'))

    expect(r.status).toBe(200)
    expect(r.body.conti).toHaveLength(1)
    expect(r.body.conti[0].sincronizzazioniRimaste).toBe(3)
    expect(r.body.conti[0].ultimaRiuscita).toBeNull()
    // Senza chiave il pannello deve poterlo dire, invece di mostrare
    // «mail inviata: no» come se fosse un esito normale.
    expect(r.body.mailConfigurata).toBe(false)
  })
})
