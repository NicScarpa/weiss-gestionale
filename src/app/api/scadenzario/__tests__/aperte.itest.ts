import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { GET } from '../route'

setupIntegrationDb()

async function lista(searchParams: Record<string, string>) {
  return callRoute<{ data: Array<{ descrizione: string; importoResiduo: number }> }>(GET, jsonRequest('/api/scadenzario', { searchParams }))
}

// Il dialogo «Collega fattura» chiede solo ciò che si può ancora saldare: gli
// stati aperti sono tre, e `stato=` ne prende uno solo.
describe('GET /api/scadenzario?aperte=1', () => {
  it('prende aperte, parzialmente pagate e scadute; non pagate né annullate', async () => {
    await loginAs('admin')
    await creaScadenza({ descrizione: 'aperta', importoTotale: 100 })
    await creaScadenza({ descrizione: 'parziale', importoTotale: 100, importoPagato: 40, stato: 'parzialmente_pagata' })
    await creaScadenza({ descrizione: 'scaduta', importoTotale: 100, stato: 'scaduta' })
    await creaScadenza({ descrizione: 'pagata', importoTotale: 100, importoPagato: 100, stato: 'pagata' })
    await creaScadenza({ descrizione: 'annullata', importoTotale: 100, stato: 'annullata' })

    const risposta = await lista({ aperte: '1', sortBy: 'descrizione', sortOrder: 'asc' })
    expect(risposta.status).toBe(200)
    expect(risposta.body.data.map((s) => s.descrizione)).toEqual(['aperta', 'parziale', 'scaduta'])
    expect(risposta.body.data.find((s) => s.descrizione === 'parziale')?.importoResiduo).toBe(60)
  })
})
