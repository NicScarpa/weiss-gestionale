import { describe, it, expect, beforeEach } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaScadenza, creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { GET as GET_summary } from '@/app/api/scadenzario/summary/route'
import { POST as POST_pagamento } from '@/app/api/scadenzario/[id]/pagamenti/route'
import { POST as POST_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/route'

/**
 * Il buco che questo test presidia: una scadenza si può dichiarare pagata
 * registrando un pagamento, senza che nessun movimento di prima nota esista.
 * La scadenza esce dal previsionale e il denaro non entra mai nel consuntivo.
 * Non è un errore da vietare — i contanti si pagano così — ma va contato.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

async function leggiSummary() {
  const risposta = await callRoute<{
    pagateSenzaMovimento: number
    pagateSenzaMovimentoImporto: number
  }>(GET_summary, jsonRequest('/api/scadenzario/summary'), {})
  return risposta.body
}

describe('scadenze pagate senza movimento', () => {
  it('conta la scadenza saldata con un pagamento manuale', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    await callRoute(
      POST_pagamento,
      jsonRequest(`/api/scadenzario/${scadenza.id}/pagamenti`, {
        method: 'POST',
        body: { importo: 100, dataPagamento: '2026-08-11' },
      }),
      { id: scadenza.id }
    )

    const summary = await leggiSummary()
    expect(summary.pagateSenzaMovimento).toBe(1)
    expect(summary.pagateSenzaMovimentoImporto).toBe(100)
  })

  it('non conta la scadenza saldata da una riconciliazione', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })
    const movimento = await creaMovimento({ uscita: 100 })

    await callRoute(
      POST_riconciliazione,
      jsonRequest(`/api/scadenzario/${scadenza.id}/riconciliazioni`, {
        method: 'POST',
        body: { journalEntryId: movimento.id },
      }),
      { id: scadenza.id }
    )

    const summary = await leggiSummary()
    expect(summary.pagateSenzaMovimento).toBe(0)
  })

  it('conta anche il pagamento parziale, per la sola quota pagata', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    await callRoute(
      POST_pagamento,
      jsonRequest(`/api/scadenzario/${scadenza.id}/pagamenti`, {
        method: 'POST',
        body: { importo: 40, dataPagamento: '2026-08-11' },
      }),
      { id: scadenza.id }
    )

    const summary = await leggiSummary()
    expect(summary.pagateSenzaMovimento).toBe(1)
    expect(summary.pagateSenzaMovimentoImporto).toBe(40)
  })
})
