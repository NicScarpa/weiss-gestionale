import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import {
  creaFattura,
  creaMovimento,
  creaScadenza,
  fornitoreDiTest,
} from '@/test/integration/fixtures/scadenzario'
import { saldiAlGiorno } from '@/lib/saldi'
import { POST as POST_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/route'
import { DELETE as DELETE_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/[reconciliationId]/route'

/**
 * L'invariante: ogni riga di prima nota corrisponde a un movimento di denaro
 * realmente avvenuto, e i documenti vi si associano — mai il contrario.
 *
 * Spec: docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

describe('un documento fiscale non genera denaro', () => {
  it('importare e categorizzare una fattura non muove né banca né cassa', async () => {
    const venue = await venueDiTest()
    const prima = await saldiAlGiorno(venue.id, '2026-12-31')

    const fornitore = await fornitoreDiTest()
    const fattura = await creaFattura({
      status: 'CATEGORIZED',
      totalAmount: 1200,
      supplierId: fornitore.id,
    })
    await creaScadenza({ importoTotale: 1200, invoiceId: fattura.id, tipo: 'passiva' })

    const dopo = await saldiAlGiorno(venue.id, '2026-12-31')

    // È il test che, se fosse esistito, avrebbe impedito i 92,60 € verso TIM
    // comparsi nel registro banca senza che la banca si muovesse.
    expect(dopo.bankBalance).toBe(prima.bankBalance)
    expect(dopo.cashBalance).toBe(prima.cashBalance)
  })

  it('nemmeno una fattura con più rate muove i saldi', async () => {
    const venue = await venueDiTest()
    const prima = await saldiAlGiorno(venue.id, '2026-12-31')

    const fattura = await creaFattura({ status: 'CATEGORIZED', totalAmount: 900 })
    await creaScadenza({ importoTotale: 300, invoiceId: fattura.id, tipo: 'passiva' })
    await creaScadenza({ importoTotale: 300, invoiceId: fattura.id, tipo: 'passiva' })
    await creaScadenza({ importoTotale: 300, invoiceId: fattura.id, tipo: 'passiva' })

    const dopo = await saldiAlGiorno(venue.id, '2026-12-31')

    expect(dopo.bankBalance).toBe(prima.bankBalance)
    expect(dopo.cashBalance).toBe(prima.cashBalance)
  })
})

describe('il dis-abbinamento non cancella il movimento', () => {
  it('annullare la riconciliazione lascia il movimento e il suo effetto sul saldo', async () => {
    const venue = await venueDiTest()
    const movimento = await creaMovimento({ uscita: 200 })
    const scadenza = await creaScadenza({ importoTotale: 200, tipo: 'passiva' })

    const creata = await callRoute<{ id?: string }, { id: string }>(
      POST_riconciliazione,
      jsonRequest(`/api/scadenzario/${scadenza.id}/riconciliazioni`, {
        method: 'POST',
        body: { journalEntryId: movimento.id },
      }),
      { id: scadenza.id }
    )
    expect(creata.status).toBe(201)

    const conRiconciliazione = await saldiAlGiorno(venue.id, '2026-12-31')

    const esito = await callRoute(
      DELETE_riconciliazione,
      jsonRequest(
        `/api/scadenzario/${scadenza.id}/riconciliazioni/${creata.body.id}`,
        { method: 'DELETE' }
      ),
      { id: scadenza.id, reconciliationId: creata.body.id! }
    )
    expect(esito.status).toBe(200)

    // Decisione 5 della spec. Il movimento dice «di banca ne è uscita, quel
    // giorno», e quel fatto non dipende da quale documento salda: annullare
    // l'abbinamento riapre la scadenza, non riscrive la storia del conto.
    // Il contrario ricreerebbe in piccolo il difetto che questa spec toglie —
    // un documento che comanda l'esistenza di un movimento.
    const vivo = await prisma.journalEntry.findUnique({ where: { id: movimento.id } })
    expect(vivo).not.toBeNull()
    expect(vivo?.deletedAt).toBeNull()

    const dopo = await saldiAlGiorno(venue.id, '2026-12-31')
    expect(dopo.bankBalance).toBe(conRiconciliazione.bankBalance)
  })
})
