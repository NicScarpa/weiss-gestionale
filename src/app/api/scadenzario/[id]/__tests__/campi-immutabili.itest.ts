import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { PATCH as PATCH_scadenza } from '../route'

/**
 * Il verso di una scadenza non si cambia.
 *
 * Prima il PATCH scartava `tipo` in silenzio: la schermata di modifica lo
 * mostra in un menu attivo, l'utente poteva sceglierlo, salvare, e trovarsi la
 * scadenza identica a prima senza che nulla dicesse perché.
 *
 * Si rifiuta il CAMBIO, non la presenza del campo, e la differenza è tutt'altro
 * che formale: la schermata di modifica rimanda l'intero oggetto —
 * `CreateScheduleInput` ha `tipo` obbligatorio — quindi un rifiuto sulla sola
 * presenza renderebbe impossibile modificare anche solo la descrizione.
 */
setupIntegrationDb()

let venueId: string

beforeEach(async () => {
  await loginAs('admin')
  venueId = (await venueDiTest()).id
})

function modifica(id: string, body: Record<string, unknown>) {
  return callRoute<{ error?: string }, { id: string }>(
    PATCH_scadenza,
    jsonRequest(`/api/scadenzario/${id}`, { method: 'PATCH', body }),
    { id }
  )
}

async function rileggi(id: string) {
  return prisma.schedule.findUniqueOrThrow({ where: { id } })
}

describe('il tipo della scadenza è immutabile', () => {
  it('cambiare il verso è rifiutato, e la scadenza non si muove', async () => {
    const scadenza = await creaScadenza({ venueId, tipo: 'passiva', descrizione: 'Fornitore' })

    const esito = await modifica(scadenza.id, { tipo: 'attiva', descrizione: 'Fornitore' })

    expect(esito.status).toBe(400)
    const dopo = await rileggi(scadenza.id)
    expect(dopo.tipo).toBe('passiva')
    expect(dopo.descrizione).toBe('Fornitore')
  })

  it('il rifiuto dice perché, non solo che è vietato', async () => {
    const scadenza = await creaScadenza({ venueId, tipo: 'passiva' })

    const esito = await modifica(scadenza.id, { tipo: 'attiva' })

    expect(esito.body.error).toMatch(/riconcilia|vers|incass|pag/i)
  })

  it('rimandare lo stesso tipo NON è un cambio: la modifica passa', async () => {
    // È il caso normale dell'interfaccia, che rispedisce l'intero oggetto.
    // Se questo test diventasse rosso, la schermata di modifica sarebbe
    // inutilizzabile per qualunque campo.
    const scadenza = await creaScadenza({ venueId, tipo: 'passiva', descrizione: 'Vecchia' })

    const esito = await modifica(scadenza.id, { tipo: 'passiva', descrizione: 'Nuova' })

    expect(esito.status).toBe(200)
    expect((await rileggi(scadenza.id)).descrizione).toBe('Nuova')
  })

  it('una modifica che non nomina il tipo continua a funzionare', async () => {
    const scadenza = await creaScadenza({ venueId, tipo: 'attiva', descrizione: 'Cliente' })

    const esito = await modifica(scadenza.id, { descrizione: 'Cliente rettificato' })

    expect(esito.status).toBe(200)
    const dopo = await rileggi(scadenza.id)
    expect(dopo.descrizione).toBe('Cliente rettificato')
    expect(dopo.tipo).toBe('attiva')
  })

  it('vale anche su una scadenza già riconciliata, che è il caso che fa danno', async () => {
    const scadenza = await creaScadenza({ venueId, tipo: 'passiva', importoTotale: 100 })
    await prisma.schedulePayment.create({
      data: { scheduleId: scadenza.id, importo: 100, dataPagamento: new Date('2026-08-01') },
    })

    expect((await modifica(scadenza.id, { tipo: 'attiva' })).status).toBe(400)
    expect((await rileggi(scadenza.id)).tipo).toBe('passiva')
  })
})
