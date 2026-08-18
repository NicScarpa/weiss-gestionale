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
import { prisma } from '@/lib/prisma'
import { ricalcolaStatoSchedule } from '@/lib/scadenzario/stato-schedule'

/**
 * Un pagamento **senza** movimento di prima nota.
 *
 * Dalla rotta non se ne ottengono più: registrare un pagamento crea anche la
 * scrittura e il legame. Restano però i pagamenti scritti prima che quella
 * strada esistesse, ed è esattamente ciò che questo contatore serve a
 * scovare — quindi il caso si costruisce qui, direttamente.
 */
async function pagamentoSenzaMovimento(scheduleId: string, importo: number) {
  const pagamento = await prisma.schedulePayment.create({
    data: { scheduleId, importo, dataPagamento: new Date('2026-08-11') },
  })
  await ricalcolaStatoSchedule(prisma, scheduleId)
  return pagamento
}

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

/** Lista con entrambi i filtri combinati, come potrebbe chiamarla chi non passa dalla card. */
async function leggiListaPagateSenzaMovimentoConStato(stato: string) {
  const risposta = await callRoute<{ data: Array<{ id: string }> }>(
    GET_lista,
    jsonRequest('/api/scadenzario', { searchParams: { pagateSenzaMovimento: 'true', stato } }),
    {}
  )
  return risposta.body.data
}

describe('scadenze pagate senza movimento', () => {
  it('conta la scadenza saldata con un pagamento manuale', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    await pagamentoSenzaMovimento(scadenza.id, 100)

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

    await pagamentoSenzaMovimento(scadenza.id, 40)

    const summary = await leggiSummary()
    expect(summary.pagateSenzaMovimento).toBe(1)
    expect(summary.pagateSenzaMovimentoImporto).toBe(40)
  })

  it('la scadenza pagata a mano e poi annullata non compare né nel contatore né nella lista filtrata', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    await pagamentoSenzaMovimento(scadenza.id, 100)

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

  it('un filtro ?stato= esplicito resta in vigore insieme a pagateSenzaMovimento', async () => {
    // Pagata per intero: stato 'pagata', nessun movimento collegato
    const pagataIntera = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })
    await pagamentoSenzaMovimento(pagataIntera.id, 100)

    // Pagata in parte: stato 'parzialmente_pagata', anche questa senza movimento
    const pagataParziale = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })
    await pagamentoSenzaMovimento(pagataParziale.id, 40)

    // Entrambe soddisfano pagateSenzaMovimento da sole
    expect(await leggiListaPagateSenzaMovimento()).toHaveLength(2)

    // Con ?stato=pagata in AND, solo quella pagata per intero deve restare:
    // se il criterio condiviso sovrascrivesse where.stato invece di comporsi
    // in AND, questa asserzione fallirebbe restituendo anche la parziale
    const filtrata = await leggiListaPagateSenzaMovimentoConStato('pagata')
    expect(filtrata.map((s) => s.id)).toEqual([pagataIntera.id])
  })
})
