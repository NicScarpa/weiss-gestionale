import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { GET } from '../route'
import { PUT } from '../[id]/route'

setupIntegrationDb()

async function rigaCollegata(journalEntryId: string) {
  const venue = await venueDiTest()
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id, transactionDate: new Date('2026-08-03'), description: 'Bonifico', amount: -100,
      importSource: 'PSD2_GOCARDLESS', status: 'MANUAL', matchedEntryId: journalEntryId, residuoDocumenti: 0,
    },
  })
}

describe('le scritture nate da una riga bancaria', () => {
  it('la lista dice da quale riga nasce ogni scrittura, e sa escludere quelle collegate', async () => {
    await loginAs('admin')
    const collegata = await creaMovimento({ uscita: 100, description: 'collegata' })
    const libera = await creaMovimento({ uscita: 50, description: 'libera' })
    const riga = await rigaCollegata(collegata.id)

    const tutte = await callRoute<{ data: Array<{ id: string; bankTransactionId: string | null }> }>(GET, jsonRequest('/api/prima-nota', { searchParams: { registerType: 'BANK' } }))
    expect(tutte.status).toBe(200)
    expect(tutte.body.data.find((e) => e.id === collegata.id)?.bankTransactionId).toBe(riga.id)
    expect(tutte.body.data.find((e) => e.id === libera.id)?.bankTransactionId).toBeNull()

    const senza = await callRoute<{ data: Array<{ id: string }> }>(GET, jsonRequest('/api/prima-nota', { searchParams: { registerType: 'BANK', senzaRigaBancaria: 'true' } }))
    expect(senza.body.data.map((e) => e.id)).toEqual([libera.id])
  })

  it('la data di una scrittura collegata alla banca non si cambia dalla prima nota', async () => {
    await loginAs('admin')
    const collegata = await creaMovimento({ uscita: 100, date: new Date('2026-08-03') })
    await rigaCollegata(collegata.id)

    const spostata = await callRoute<{ error?: string; code?: string }, { id: string }>(
      PUT,
      jsonRequest(`/api/prima-nota/${collegata.id}`, { method: 'PUT', body: { date: '2026-08-04', description: 'x' } }),
      { id: collegata.id }
    )
    expect(spostata.status).toBe(409)
    expect(spostata.body.code).toBe('DATA_DALLA_BANCA')

    // La stessa data, o nessuna data: la descrizione si cambia come sempre.
    const stessaData = await callRoute<{ id?: string }, { id: string }>(
      PUT,
      jsonRequest(`/api/prima-nota/${collegata.id}`, { method: 'PUT', body: { date: '2026-08-03', description: 'nuova descrizione' } }),
      { id: collegata.id }
    )
    expect(stessaData.status).toBe(200)
  })
})
