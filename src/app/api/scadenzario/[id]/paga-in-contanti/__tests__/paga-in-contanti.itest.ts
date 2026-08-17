import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import {
  creaFattura,
  creaScadenza,
  fornitoreDiTest,
  rileggiScadenza,
} from '@/test/integration/fixtures/scadenzario'
import { saldiAlGiorno } from '@/lib/saldi'
import { POST } from '../route'

/**
 * Il ciclo completo del pagamento in contanti, su database vero.
 *
 * L'invariante che difende: la cassa si muove quando il denaro si muove, e il
 * documento vi si associa. Prima esisteva un bottone che scriveva un'uscita di
 * banca a partire dalla sola fattura — nessun movimento dietro, data sbagliata,
 * e un secondo conteggio in agguato all'arrivo dell'estratto conto.
 */
setupIntegrationDb()

async function pagaInContanti(scheduleId: string, corpo: Record<string, unknown>) {
  return callRoute<
    { error?: string; journalEntryId?: string; reconciliationId?: string; stato?: string },
    { id: string }
  >(
    POST,
    jsonRequest(`/api/scadenzario/${scheduleId}/paga-in-contanti`, {
      method: 'POST',
      body: corpo,
    }),
    { id: scheduleId }
  )
}

beforeEach(async () => {
  await loginAs('admin')
})

describe('pagamento in contanti di una scadenza da fattura', () => {
  it('crea il movimento di cassa, salda la scadenza e chiude la fattura', async () => {
    const fornitore = await fornitoreDiTest()
    const fattura = await creaFattura({
      status: 'CATEGORIZED',
      totalAmount: 120,
      supplierId: fornitore.id,
    })
    const scadenza = await creaScadenza({
      importoTotale: 120,
      invoiceId: fattura.id,
      tipo: 'passiva',
    })

    const esito = await pagaInContanti(scadenza.id, { dataPagamento: '2026-08-10' })

    expect(esito.status).toBe(200)

    const movimento = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: esito.body.journalEntryId! },
    })
    expect(movimento.registerType).toBe('CASH')
    expect(movimento.date.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(Number(movimento.creditAmount)).toBe(120)
    expect(movimento.debitAmount).toBeNull()
    expect(movimento.verified).toBe(true)

    const rata = await rileggiScadenza(scadenza.id)
    expect(rata.stato).toBe('pagata')
    expect(rata.importoPagatoNum).toBe(120)

    const dopo = await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })
    expect(dopo.status).toBe('PAID')

    const riconciliazione = await prisma.scheduleReconciliation.findFirstOrThrow({
      where: { scheduleId: scadenza.id, status: 'VERIFIED' },
    })
    expect(riconciliazione.journalEntryId).toBe(movimento.id)
    expect(riconciliazione.paymentId).not.toBeNull()
  })

  it('muove il saldo cassa dell\'importo pagato, e non tocca la banca', async () => {
    const venue = await venueDiTest()
    const prima = await saldiAlGiorno(venue.id, '2026-12-31')

    const scadenza = await creaScadenza({ importoTotale: 75, tipo: 'passiva' })
    await pagaInContanti(scadenza.id, { dataPagamento: '2026-08-10' })

    const dopo = await saldiAlGiorno(venue.id, '2026-12-31')

    expect(dopo.cashBalance).toBe(prima.cashBalance - 75)
    expect(dopo.bankBalance).toBe(prima.bankBalance)
  })

  it('un pagamento parziale lascia la scadenza aperta per il residuo', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    const esito = await pagaInContanti(scadenza.id, {
      dataPagamento: '2026-08-10',
      importo: 40,
    })

    expect(esito.status).toBe(200)

    const rata = await rileggiScadenza(scadenza.id)
    expect(rata.importoPagatoNum).toBe(40)
    expect(rata.stato).not.toBe('pagata')
  })

  it('non lascia movimenti in piedi se la quota supera il residuo', async () => {
    const venue = await venueDiTest()
    const scadenza = await creaScadenza({ importoTotale: 50, tipo: 'passiva' })
    const prima = await saldiAlGiorno(venue.id, '2026-12-31')

    const esito = await pagaInContanti(scadenza.id, {
      dataPagamento: '2026-08-10',
      importo: 500,
    })

    expect(esito.status).toBe(422)

    // Il punto: la transazione ha annullato anche la creazione del movimento.
    // Senza, resterebbe cassa uscita per 500 € senza nulla di saldato — cioè
    // il difetto che questa spec elimina, in miniatura.
    const dopo = await saldiAlGiorno(venue.id, '2026-12-31')
    expect(dopo.cashBalance).toBe(prima.cashBalance)

    const movimenti = await prisma.journalEntry.count({
      where: { venueId: venue.id, registerType: 'CASH' },
    })
    expect(movimenti).toBe(0)
  })
})
