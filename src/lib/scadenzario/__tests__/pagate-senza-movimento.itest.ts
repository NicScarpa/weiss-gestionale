import { describe, it, expect, beforeEach } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaScadenza, creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { GET as GET_summary } from '@/app/api/scadenzario/summary/route'
import { GET as GET_lista } from '@/app/api/scadenzario/route'
import { POST as POST_pagamento } from '@/app/api/scadenzario/[id]/pagamenti/route'
import { POST as POST_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/route'
import { DELETE as DELETE_scadenza } from '@/app/api/scadenzario/[id]/route'

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

/** Stessa lista che apre il click sulla card, con lo stesso filtro applicato. */
async function leggiListaPagateSenzaMovimento() {
  const risposta = await callRoute<{ data: Array<{ id: string }> }>(
    GET_lista,
    jsonRequest('/api/scadenzario', { searchParams: { pagateSenzaMovimento: 'true' } }),
    {}
  )
  return risposta.body.data
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

  it('la scadenza pagata a mano e poi annullata non compare né nel contatore né nella lista filtrata', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    await callRoute(
      POST_pagamento,
      jsonRequest(`/api/scadenzario/${scadenza.id}/pagamenti`, {
        method: 'POST',
        body: { importo: 100, dataPagamento: '2026-08-11' },
      }),
      { id: scadenza.id }
    )

    // Prima dell'annullamento il fenomeno è visibile su entrambe le strade
    expect((await leggiSummary()).pagateSenzaMovimento).toBe(1)
    expect(await leggiListaPagateSenzaMovimento()).toHaveLength(1)

    // La cancellazione logica porta lo stato ad 'annullata' ma NON azzera
    // importoPagato (ricalcolaStatoSchedule lo deriva dai pagamenti, che
    // restano): senza l'esclusione delle annullate nel criterio condiviso,
    // il contatore e la lista tornerebbero a divergere
    await callRoute(
      DELETE_scadenza,
      jsonRequest(`/api/scadenzario/${scadenza.id}`, { method: 'DELETE' }),
      { id: scadenza.id }
    )

    expect((await leggiSummary()).pagateSenzaMovimento).toBe(0)
    expect(await leggiListaPagateSenzaMovimento()).toHaveLength(0)
  })
})
