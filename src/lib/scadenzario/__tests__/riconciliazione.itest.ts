import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import {
  creaFattura,
  creaMovimento,
  creaScadenza,
  fornitoreDiTest,
  rileggiScadenza,
} from '@/test/integration/fixtures/scadenzario'
import { POST as POST_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/route'
import { DELETE as DELETE_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/[reconciliationId]/route'

/**
 * Capienza del movimento, concorrenza e ritorno indietro della fattura.
 *
 * Sono le tre falle che rendevano la riconciliazione una macchina a stati
 * bugiarda: un bonifico poteva saldare più di quanto valesse, due click
 * simultanei creavano due pagamenti, e una fattura arrivata a PAID non tornava
 * mai indietro nemmeno annullando la riconciliazione che l'aveva chiusa.
 */
setupIntegrationDb()

async function riconcilia(scheduleId: string, journalEntryId: string, amount?: number) {
  return callRoute<{ error?: string; id?: string; scheduleStato?: string }, { id: string }>(
    POST_riconciliazione,
    jsonRequest(`/api/scadenzario/${scheduleId}/riconciliazioni`, {
      method: 'POST',
      body: { journalEntryId, ...(amount !== undefined ? { amount } : {}) },
    }),
    { id: scheduleId }
  )
}

beforeEach(async () => {
  await loginAs('admin')
})

describe('capienza del movimento', () => {
  it('un movimento da 100 non può saldare due scadenze da 100', async () => {
    const movimento = await creaMovimento({ uscita: 100 })
    const prima = await creaScadenza({ importoTotale: 100 })
    const seconda = await creaScadenza({ importoTotale: 100 })

    const esitoPrimo = await riconcilia(prima.id, movimento.id)
    expect(esitoPrimo.status).toBe(201)

    const esitoSecondo = await riconcilia(seconda.id, movimento.id)

    expect(esitoSecondo.status).toBe(422)
    expect(esitoSecondo.body.error).toMatch(/movimento/i)

    const dopo = await rileggiScadenza(seconda.id)
    expect(dopo.stato).toBe('aperta')
    expect(dopo.importoPagatoNum).toBe(0)
  })

  it('lo stesso movimento copre più scadenze fino a concorrenza', async () => {
    const movimento = await creaMovimento({ uscita: 100 })
    const prima = await creaScadenza({ importoTotale: 60 })
    const seconda = await creaScadenza({ importoTotale: 60 })

    expect((await riconcilia(prima.id, movimento.id)).status).toBe(201)
    // Sulla seconda resta capienza per 40: la riconciliazione passa ma è parziale
    expect((await riconcilia(seconda.id, movimento.id)).status).toBe(201)

    expect((await rileggiScadenza(prima.id)).stato).toBe('pagata')
    const dopo = await rileggiScadenza(seconda.id)
    expect(dopo.stato).toBe('parzialmente_pagata')
    expect(dopo.importoPagatoNum).toBe(40)
  })

  it('una quota esplicita oltre la capienza residua del movimento è rifiutata', async () => {
    const movimento = await creaMovimento({ uscita: 100 })
    const prima = await creaScadenza({ importoTotale: 100 })
    const seconda = await creaScadenza({ importoTotale: 100 })

    await riconcilia(prima.id, movimento.id, 70)
    const esito = await riconcilia(seconda.id, movimento.id, 50)

    expect(esito.status).toBe(422)
    expect((await rileggiScadenza(seconda.id)).importoPagatoNum).toBe(0)
  })
})

describe('riconciliazioni concorrenti', () => {
  it(
    'due riconciliazioni simultanee sulla stessa coppia: ne sopravvive una sola',
    { repeats: 5 },
    async () => {
      const movimento = await creaMovimento({ uscita: 100 })
      const scadenza = await creaScadenza({ importoTotale: 100 })

      const esiti = await Promise.all([
        riconcilia(scadenza.id, movimento.id),
        riconcilia(scadenza.id, movimento.id),
      ])

      const riuscite = esiti.filter((e) => e.status === 201)
      expect(riuscite).toHaveLength(1)
      // La perdente deve arrivare a un rifiuto pulito, non a un 500
      expect(esiti.filter((e) => e.status === 409)).toHaveLength(1)

      const dopo = await rileggiScadenza(scadenza.id)
      expect(dopo.importoPagatoNum).toBe(100)
      expect(dopo.stato).toBe('pagata')

      expect(
        await prisma.scheduleReconciliation.count({
          where: { scheduleId: scadenza.id, status: 'VERIFIED' },
        })
      ).toBe(1)
      expect(await prisma.schedulePayment.count({ where: { scheduleId: scadenza.id } })).toBe(1)
    }
  )

  it(
    'due scadenze diverse sullo stesso movimento capiente per una sola: passa una sola',
    { repeats: 5 },
    async () => {
      const movimento = await creaMovimento({ uscita: 100 })
      const prima = await creaScadenza({ importoTotale: 100 })
      const seconda = await creaScadenza({ importoTotale: 100 })

      const esiti = await Promise.all([
        riconcilia(prima.id, movimento.id),
        riconcilia(seconda.id, movimento.id),
      ])

      expect(esiti.filter((e) => e.status === 201)).toHaveLength(1)

      const impegnato = await prisma.scheduleReconciliation.aggregate({
        where: { journalEntryId: movimento.id, status: 'VERIFIED' },
        _sum: { amount: true },
      })
      expect(Number(impegnato._sum.amount ?? 0)).toBeLessThanOrEqual(100)
    }
  )
})

describe('annullo della riconciliazione', () => {
  it("annullare l'ultima rata riporta indietro la fattura da PAID", async () => {
    const fornitore = await fornitoreDiTest()
    const fattura = await creaFattura({
      status: 'MATCHED',
      totalAmount: 200,
      supplierId: fornitore.id,
    })
    const rataUno = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id })
    const rataDue = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id })

    const bonificoUno = await creaMovimento({ uscita: 100 })
    const bonificoDue = await creaMovimento({ uscita: 100 })

    await riconcilia(rataUno.id, bonificoUno.id)
    const ultima = await riconcilia(rataDue.id, bonificoDue.id)

    expect((await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })).status)
      .toBe('PAID')

    const esito = await callRoute(
      DELETE_riconciliazione,
      jsonRequest(`/api/scadenzario/${rataDue.id}/riconciliazioni/${ultima.body.id}`, {
        method: 'DELETE',
      }),
      { id: rataDue.id, reconciliationId: ultima.body.id! }
    )

    expect(esito.status).toBe(200)

    const dopo = await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })
    expect(dopo.status).not.toBe('PAID')
    // La prima rata resta saldata, quindi la fattura è PARZIALMENTE pagata.
    // Fino al 15 ago 2026 qui si leggeva 'MATCHED': la fattura dichiarava di
    // non aver ricevuto un euro mentre metà del suo valore era stato pagato.
    expect(dopo.status).toBe('PARTIALLY_PAID')

    const rata = await rileggiScadenza(rataDue.id)
    expect(rata.stato).toBe('aperta')
    expect(rata.importoPagatoNum).toBe(0)
    expect(rata.dataPagamento).toBeNull()
  })

  it('una fattura senza registrazione in prima nota torna allo stato che i dati dimostrano', async () => {
    const fattura = await creaFattura({ status: 'IMPORTED', totalAmount: 100 })
    const scadenza = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id })
    const movimento = await creaMovimento({ uscita: 100 })

    const riconciliazione = await riconcilia(scadenza.id, movimento.id)
    expect(
      (await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })).status
    ).toBe('PAID')

    await callRoute(
      DELETE_riconciliazione,
      jsonRequest(`/api/scadenzario/${scadenza.id}/riconciliazioni/${riconciliazione.body.id}`, {
        method: 'DELETE',
      }),
      { id: scadenza.id, reconciliationId: riconciliazione.body.id! }
    )

    const dopo = await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })
    expect(dopo.status).toBe('IMPORTED')
  })

  it('con una rata ancora aperta la fattura non diventa mai PAID', async () => {
    const fornitore = await fornitoreDiTest()
    const fattura = await creaFattura({
      status: 'MATCHED',
      totalAmount: 200,
      supplierId: fornitore.id,
    })
    const rataUno = await creaScadenza({ importoTotale: 100, invoiceId: fattura.id })
    await creaScadenza({ importoTotale: 100, invoiceId: fattura.id })

    const movimento = await creaMovimento({ uscita: 100 })
    await riconcilia(rataUno.id, movimento.id)

    expect(
      (await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: fattura.id } })).status
    ).toBe('PARTIALLY_PAID')
  })
})

describe('lettura della scadenza dentro la transazione', () => {
  it("l'importo pagato è sempre la somma dei pagamenti registrati, non un incremento cieco", async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, importoPagato: 30 })
    // Deriva pregressa: importoPagato dice 30 ma non c'è alcun pagamento a supporto
    const movimento = await creaMovimento({ uscita: 70 })

    await riconcilia(scadenza.id, movimento.id, 70)

    const dopo = await rileggiScadenza(scadenza.id)
    // La somma dei pagamenti veri è 70: la deriva viene risanata, non ereditata
    expect(dopo.importoPagatoNum).toBe(70)
    expect(dopo.stato).toBe('parzialmente_pagata')
  })
})

describe('annullo con il movimento cancellato', () => {
  it('libera comunque la scadenza e non tocca il movimento', async () => {
    // Succede davvero: eliminare una chiusura di cassa cancella anche le
    // scritture che ha generato, comprese quelle già riconciliate. Se
    // l'annullo si rifiutasse di procedere, la scadenza resterebbe pagata per
    // sempre a fronte di un movimento che non esiste più.
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const movimento = await creaMovimento({ uscita: 100 })
    const riconciliazione = await riconcilia(scadenza.id, movimento.id)
    expect(riconciliazione.status).toBe(201)

    // Fetta ereditata dalla riconciliazione: è lei a far entrare l'annullo nel
    // ramo che poi riscrive il movimento.
    const conto = await prisma.account.findFirstOrThrow({ where: { isActive: true } })
    await prisma.journalEntryAllocation.create({
      data: {
        journalEntryId: movimento.id,
        accountId: conto.id,
        importo: 100,
        origine: 'ereditata',
        reconciliationId: riconciliazione.body.id!,
      },
    })

    await prisma.journalEntry.updateMany({
      where: { id: movimento.id },
      data: { deletedAt: new Date() },
    })

    const esito = await callRoute(
      DELETE_riconciliazione,
      jsonRequest(
        `/api/scadenzario/${scadenza.id}/riconciliazioni/${riconciliazione.body.id}`,
        { method: 'DELETE' }
      ),
      { id: scadenza.id, reconciliationId: riconciliazione.body.id! }
    )

    expect(esito.status).toBe(200)
    expect((await rileggiScadenza(scadenza.id)).stato).toBe('aperta')

    // Il movimento cancellato resta com'era: non si scrive su ciò che non c'è.
    const grezzo = await prisma.$queryRaw<{ categorization_source: string | null }[]>`
      SELECT categorization_source FROM journal_entries WHERE id = ${movimento.id}
    `
    expect(grezzo[0]?.categorization_source).not.toBe('manual')
  })
})
