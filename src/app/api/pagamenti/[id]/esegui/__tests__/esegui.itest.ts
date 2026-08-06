import { describe, it, expect } from 'vitest'
import type { PaymentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { money, toApi } from '@/lib/money'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { POST as eseguiPagamento } from '../route'

/**
 * Segno e unicità del movimento generato da un pagamento.
 *
 * Un pagamento è un'uscita: deve *abbassare* il saldo della banca. Il saldo si
 * ricalcola qui dai movimenti (`dare − avere`) invece di chiederlo a
 * `/api/prima-nota/saldi`, così il test misura ciò che è finito in contabilità
 * e non l'opinione di un'altra route.
 */
setupIntegrationDb()

const IMPORTO = 1000
const GIORNO = new Date('2026-05-20')

async function creaPagamento(overrides: { stato?: PaymentStatus; importo?: number } = {}) {
  const venue = await venueDiTest()

  return prisma.payment.create({
    data: {
      venueId: venue.id,
      tipo: 'BONIFICO',
      stato: overrides.stato ?? 'DA_APPROVARE',
      dataEsecuzione: GIORNO,
      importo: overrides.importo ?? IMPORTO,
      beneficiarioNome: 'Fornitore di prova',
      causale: 'Fattura 42',
    },
  })
}

/** Saldo del registro banca letto dai movimenti: apertura implicita a zero. */
async function saldoBanca(venueId: string): Promise<number> {
  const totali = await prisma.journalEntry.aggregate({
    where: { venueId, registerType: 'BANK' },
    _sum: { debitAmount: true, creditAmount: true },
  })

  return toApi(money(totali._sum.debitAmount).minus(money(totali._sum.creditAmount)))
}

async function esegui(id: string) {
  return callRoute(
    eseguiPagamento,
    jsonRequest(`/api/pagamenti/${id}/esegui`, { method: 'POST' }),
    { id }
  )
}

describe('POST /api/pagamenti/[id]/esegui', () => {
  it('abbassa il saldo della banca dell\'importo pagato', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()
    const saldoIniziale = await saldoBanca(pagamento.venueId)

    const risposta = await esegui(pagamento.id)

    expect(risposta.status).toBe(200)
    expect(await saldoBanca(pagamento.venueId)).toBe(saldoIniziale - IMPORTO)
  })

  it('scrive l\'importo in avere e lascia vuoto il dare', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    await esegui(pagamento.id)

    const movimento = await prisma.journalEntry.findFirstOrThrow({
      where: { paymentId: pagamento.id },
    })

    expect(movimento.debitAmount).toBeNull()
    expect(toApi(movimento.creditAmount)).toBe(IMPORTO)
    expect(movimento.registerType).toBe('BANK')
  })

  it('collega il movimento al pagamento e lo porta in stato DISPOSTO', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    await esegui(pagamento.id)

    const aggiornato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })

    expect(aggiornato.stato).toBe('DISPOSTO')
    expect(aggiornato.journalEntryId).not.toBeNull()
  })

  // Il conflitto va riconosciuto e risposto, non subìto: un 500 significa che a
  // fermare il doppio movimento è stato il vincolo del database, e che
  // l'applicazione ci stava provando.
  it('rifiuta la seconda esecuzione dello stesso pagamento', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    await esegui(pagamento.id)
    const seconda = await esegui(pagamento.id)

    expect(seconda.status).toBe(409)
    expect(await prisma.journalEntry.count({ where: { paymentId: pagamento.id } })).toBe(1)
  })

  // La corsa non è deterministica: senza ripetizioni un fix sbagliato passerebbe
  // per fortuna invece che per costruzione.
  it('due esecuzioni simultanee creano un solo movimento', { repeats: 5 }, async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    const esiti = await Promise.all([esegui(pagamento.id), esegui(pagamento.id)])

    expect(esiti.filter((r) => r.status === 200)).toHaveLength(1)
    expect(esiti.filter((r) => r.status === 409)).toHaveLength(1)
    expect(await prisma.journalEntry.count({ where: { paymentId: pagamento.id } })).toBe(1)
    expect(await saldoBanca(pagamento.venueId)).toBe(-IMPORTO)
  })

  it('un pagamento annullato non si esegue', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento({ stato: 'ANNULLATO' })

    const risposta = await esegui(pagamento.id)

    expect(risposta.status).toBe(409)
    expect(await prisma.journalEntry.count({ where: { paymentId: pagamento.id } })).toBe(0)
  })

  it('senza sessione risponde 401 e non scrive nulla', async () => {
    const pagamento = await creaPagamento()

    const risposta = await esegui(pagamento.id)

    expect(risposta.status).toBe(401)
    expect(await prisma.journalEntry.count()).toBe(0)
  })
})
