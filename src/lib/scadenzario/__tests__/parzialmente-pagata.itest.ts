import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import {
  creaFattura,
  creaScadenza,
  fornitoreDiTest,
} from '@/test/integration/fixtures/scadenzario'
import { POST as POST_pagamento } from '@/app/api/scadenzario/[id]/pagamenti/route'

/**
 * Un conto di costo su cui imputare la scrittura che il pagamento genera.
 * `DEFAULT_STR` perché il centro di costo si risolve dal piano, senza doverlo
 * indicare: qui interessa il pagamento, non l'imputazione.
 */
async function contoDiCosto(): Promise<string> {
  const conto = await prisma.account.findFirstOrThrow({
    where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR' },
  })
  return conto.id
}

/**
 * Lo scalino che mancava fra «Da pagare» e «Pagata».
 *
 * Una fattura con una rata su due saldata — o con l'unica rata saldata a metà —
 * risultava intatta come una appena importata. Con 230 scadenze vive in
 * produzione non è un caso di scuola: è ciò che si vede tutti i giorni.
 */
setupIntegrationDb()

async function paga(scheduleId: string, importo: number) {
  return callRoute<{ error?: string }, { id: string }>(
    POST_pagamento,
    jsonRequest(`/api/scadenzario/${scheduleId}/pagamenti`, {
      method: 'POST',
      body: { importo, dataPagamento: '2026-08-10', accountId: await contoDiCosto() },
    }),
    { id: scheduleId }
  )
}

async function statoFattura(id: string) {
  const f = await prisma.electronicInvoice.findUniqueOrThrow({ where: { id } })
  return f.status
}

beforeEach(async () => {
  await loginAs('admin')
})

describe('lo stato della fattura segue i pagamenti delle sue rate', () => {
  it('rata unica saldata a metà: la fattura è parzialmente pagata', async () => {
    const fattura = await creaFattura({ status: 'CATEGORIZED', totalAmount: 100 })
    const rata = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id, tipo: 'passiva' })

    const esito = await paga(rata.id, 40)
    expect(esito.status).toBe(200)

    // È il caso più comune — una rata sola — ed è quello in cui prima la
    // fattura continuava a dire «Da pagare» come se non fosse successo nulla.
    expect(await statoFattura(fattura.id)).toBe('PARTIALLY_PAID')
  })

  it('due rate, una chiusa: la fattura è parzialmente pagata', async () => {
    const fattura = await creaFattura({ status: 'CATEGORIZED', totalAmount: 200 })
    const prima = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id, tipo: 'passiva' })
    await creaScadenza({ importoTotale: 100, invoiceId: fattura.id, tipo: 'passiva' })

    await paga(prima.id, 100)

    expect(await statoFattura(fattura.id)).toBe('PARTIALLY_PAID')
  })

  it('tutte le rate chiuse: la fattura è pagata', async () => {
    const fattura = await creaFattura({ status: 'CATEGORIZED', totalAmount: 200 })
    const prima = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id, tipo: 'passiva' })
    const seconda = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id, tipo: 'passiva' })

    await paga(prima.id, 100)
    await paga(seconda.id, 100)

    expect(await statoFattura(fattura.id)).toBe('PAID')
  })

  it('senza alcun pagamento la fattura resta dov\'era', async () => {
    const fornitore = await fornitoreDiTest()
    const fattura = await creaFattura({
      status: 'MATCHED',
      totalAmount: 100,
      supplierId: fornitore.id,
    })
    await creaScadenza({ importoTotale: 100, invoiceId: fattura.id, tipo: 'passiva' })

    expect(await statoFattura(fattura.id)).toBe('MATCHED')
  })
})
