import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import {
  creaFattura,
  creaScadenza,
  fornitoreDiTest,
  rileggiScadenza,
} from '@/test/integration/fixtures/scadenzario'
import { POST as POST_pagamento } from '@/app/api/scadenzario/[id]/pagamenti/route'
import { DELETE as DELETE_pagamento } from '@/app/api/scadenzario/[id]/pagamenti/[paymentId]/route'
import { PATCH as PATCH_stato } from '@/app/api/scadenzario/[id]/stato/route'
import { PATCH as PATCH_scadenza, DELETE as DELETE_scadenza } from '@/app/api/scadenzario/[id]/route'

/**
 * Pagamenti manuali e cambi di stato.
 *
 * Tre percorsi che scrivevano sulla scadenza ognuno con la propria aritmetica:
 * il residuo poteva diventare negativo, una scadenza SCADUTA riceveva una data
 * di pagamento inventata, e la PATCH poteva dichiararla pagata lasciando
 * l'importo pagato indietro.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

async function registraPagamento(scheduleId: string, importo: number, dataPagamento = '2026-08-01') {
  return callRoute<{ error?: string; payment?: { id: string } }, { id: string }>(
    POST_pagamento,
    jsonRequest(`/api/scadenzario/${scheduleId}/pagamenti`, {
      method: 'POST',
      body: { importo, dataPagamento },
    }),
    { id: scheduleId }
  )
}

describe('sovrapagamento vietato', () => {
  it('un pagamento superiore al residuo è rifiutato con 422', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })

    const esito = await registraPagamento(scadenza.id, 10_000)

    expect(esito.status).toBe(422)
    expect(esito.body.error).toMatch(/residuo/i)

    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.importoPagatoNum).toBe(0)
    expect(dopo.stato).toBe('aperta')
    expect(await prisma.schedulePayment.count({ where: { scheduleId: scadenza.id } })).toBe(0)
  })

  it('il residuo non diventa mai negativo nemmeno a piccoli passi', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })

    expect((await registraPagamento(scadenza.id, 60)).status).toBe(200)
    expect((await registraPagamento(scadenza.id, 50)).status).toBe(422)

    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.importoTotaleNum - dopo.importoPagatoNum).toBeGreaterThanOrEqual(0)
    expect(dopo.importoPagatoNum).toBe(60)
  })

  it(
    'due pagamenti simultanei che insieme sforerebbero: ne passa uno solo',
    { repeats: 5 },
    async () => {
      const scadenza = await creaScadenza({ importoTotale: 100 })

      const esiti = await Promise.all([
        registraPagamento(scadenza.id, 100),
        registraPagamento(scadenza.id, 100),
      ])

      expect(esiti.filter((e) => e.status === 200)).toHaveLength(1)
      const dopo = await rileggiScadenza(scadenza.id)
      expect(dopo.importoPagatoNum).toBe(100)
      expect(dopo.stato).toBe('pagata')
    }
  )

  it('il pagamento esatto del residuo salda la scadenza e ne fissa la data', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })

    expect((await registraPagamento(scadenza.id, 100, '2026-08-04')).status).toBe(200)

    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.stato).toBe('pagata')
    expect(dopo.dataPagamento?.toISOString().slice(0, 10)).toBe('2026-08-04')
  })

  it('cancellare il pagamento riapre la scadenza e cancella la data di pagamento', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const registrato = await registraPagamento(scadenza.id, 100)

    const esito = await callRoute(
      DELETE_pagamento,
      jsonRequest(`/api/scadenzario/${scadenza.id}/pagamenti/${registrato.body.payment!.id}`, {
        method: 'DELETE',
      }),
      { id: scadenza.id, paymentId: registrato.body.payment!.id }
    )

    expect(esito.status).toBe(200)
    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.stato).toBe('aperta')
    expect(dopo.importoPagatoNum).toBe(0)
    expect(dopo.dataPagamento).toBeNull()
  })
})

describe('PATCH stato', () => {
  it('marcare SCADUTA non inventa una data di pagamento', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })

    const esito = await callRoute(
      PATCH_stato,
      jsonRequest(`/api/scadenzario/${scadenza.id}/stato`, {
        method: 'PATCH',
        body: { stato: 'scaduta' },
      }),
      { id: scadenza.id }
    )

    expect(esito.status).toBe(200)
    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.stato).toBe('scaduta')
    expect(dopo.dataPagamento).toBeNull()
  })

  it('non si può dichiarare pagata una scadenza con residuo aperto', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })

    const esito = await callRoute<{ error?: string }, { id: string }>(
      PATCH_stato,
      jsonRequest(`/api/scadenzario/${scadenza.id}/stato`, {
        method: 'PATCH',
        body: { stato: 'pagata' },
      }),
      { id: scadenza.id }
    )

    expect(esito.status).toBe(422)
    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.stato).toBe('aperta')
    expect(dopo.dataPagamento).toBeNull()
  })

  it('annullare una scadenza resta possibile', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })

    const esito = await callRoute(
      PATCH_stato,
      jsonRequest(`/api/scadenzario/${scadenza.id}/stato`, {
        method: 'PATCH',
        body: { stato: 'annullata' },
      }),
      { id: scadenza.id }
    )

    expect(esito.status).toBe(200)
    expect((await rileggiScadenza(scadenza.id)).stato).toBe('annullata')
  })
})

describe('annullamento della scadenza', () => {
  it('annullare la rata rimasta chiude la fattura: una rata annullata non la tiene aperta', async () => {
    const fornitore = await fornitoreDiTest()
    const fattura = await creaFattura({
      status: 'MATCHED',
      totalAmount: 200,
      supplierId: fornitore.id,
    })
    const rataUno = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id })
    const rataDue = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id })

    await registraPagamento(rataUno.id, 100)
    expect(
      (await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })).status
      // Con una rata pagata e una ancora aperta la fattura è parzialmente
      // pagata: non saldata, ma nemmeno intatta.
    ).toBe('PARTIALLY_PAID')

    const esito = await callRoute(
      DELETE_scadenza,
      jsonRequest(`/api/scadenzario/${rataDue.id}`, { method: 'DELETE' }),
      { id: rataDue.id }
    )

    expect(esito.status).toBe(200)
    expect((await rileggiScadenza(rataDue.id)).stato).toBe('annullata')
    expect(
      (await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })).status
    ).toBe('PAID')
  })
})

describe('PATCH scadenza', () => {
  it("ridurre l'importo totale sotto quanto già pagato è rifiutato con 422", async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })
    await registraPagamento(scadenza.id, 80)

    const esito = await callRoute<{ error?: string }, { id: string }>(
      PATCH_scadenza,
      jsonRequest(`/api/scadenzario/${scadenza.id}`, {
        method: 'PATCH',
        body: { importoTotale: 50 },
      }),
      { id: scadenza.id }
    )

    expect(esito.status).toBe(422)
    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.importoTotaleNum).toBe(100)
  })

  it("ridurre l'importo totale fino al pagato salda la scadenza", async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })
    await registraPagamento(scadenza.id, 80)

    const esito = await callRoute(
      PATCH_scadenza,
      jsonRequest(`/api/scadenzario/${scadenza.id}`, {
        method: 'PATCH',
        body: { importoTotale: 80 },
      }),
      { id: scadenza.id }
    )

    expect(esito.status).toBe(200)
    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.importoTotaleNum).toBe(80)
    expect(dopo.stato).toBe('pagata')
  })

  it('stato, importo pagato e data di pagamento non sono più scrivibili dalla PATCH', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })

    const esito = await callRoute(
      PATCH_scadenza,
      jsonRequest(`/api/scadenzario/${scadenza.id}`, {
        method: 'PATCH',
        body: { stato: 'pagata', dataPagamento: '2026-08-01', importoPagato: 100 },
      }),
      { id: scadenza.id }
    )

    expect(esito.status).toBe(400)
    const dopo = await rileggiScadenza(scadenza.id)
    expect(dopo.stato).toBe('aperta')
    expect(dopo.importoPagatoNum).toBe(0)
    expect(dopo.dataPagamento).toBeNull()
  })
})
