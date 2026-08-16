import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { POST as sezionePOST } from '../[id]/sezione/route'
import { POST as ripristinaPOST } from '../[id]/ripristina/route'
import { DELETE } from '../[id]/route'
import { POST as bloccoPOST } from '../azioni-in-blocco/route'

setupIntegrationDb()

async function contesto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const centro = await prisma.costCenter.findFirstOrThrow()
  return { venueId: venue.id, centroId: centro.id }
}

async function riga(venueId: string, descrizione: string, extra: Record<string, unknown> = {}) {
  return prisma.bankTransaction.create({
    data: { venueId, transactionDate: new Date('2026-08-10'), description: descrizione, descrizione, amount: -10, importSource: 'PSD2_GOCARDLESS', status: 'PENDING', ...extra },
  })
}

const url = (id: string, coda = '') => `http://localhost/api/bank-transactions/${id}${coda}`

describe('sezione, cestino, ripristino', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('sposta una riga in Deleghe F24 e lo registra in cronologia', async () => {
    const { venueId } = await contesto()
    const r = await riga(venueId, 'F24')
    const risposta = await callRoute<unknown, { id: string }>(sezionePOST, jsonRequest(url(r.id, '/sezione'), { method: 'POST', body: { sezione: 'DELEGHE_F24' } }), { id: r.id })
    expect(risposta.status).toBe(200)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).sezione).toBe('DELEGHE_F24')
    const cronologia = await prisma.bankTransactionEdit.findMany({ where: { bankTransactionId: r.id } })
    expect(cronologia.map((c) => [c.campo, c.prima, c.dopo])).toEqual([['sezione', 'ATTIVI', 'DELEGHE_F24']])
  })

  it('il Cestino è morbido, e Ripristina lo annulla', async () => {
    const { venueId } = await contesto()
    const r = await riga(venueId, 'da cestinare')
    expect((await callRoute<unknown, { id: string }>(DELETE, jsonRequest(url(r.id), { method: 'DELETE' }), { id: r.id })).status).toBe(200)
    expect(await prisma.bankTransaction.findFirst({ where: { id: r.id, deletedAt: { not: null } } })).not.toBeNull()

    expect((await callRoute<unknown, { id: string }>(ripristinaPOST, jsonRequest(url(r.id, '/ripristina'), { method: 'POST' }), { id: r.id })).status).toBe(200)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).deletedAt).toBeNull()
  })

  it('ripristinare una riga che non è nel Cestino risponde 404', async () => {
    const { venueId } = await contesto()
    const r = await riga(venueId, 'viva')
    expect((await callRoute<unknown, { id: string }>(ripristinaPOST, jsonRequest(url(r.id, '/ripristina'), { method: 'POST' }), { id: r.id })).status).toBe(404)
  })

  // Una riga con una scrittura collegata non si cestina: prima si scollega (spec, «Le azioni»).
  it('rifiuta con 409 il Cestino su una riga con scrittura collegata', async () => {
    const { venueId, centroId } = await contesto()
    const scrittura = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-10'), registerType: 'BANK', description: 'x', creditAmount: 10, costCenterId: centroId } })
    const r = await riga(venueId, 'collegata', { matchedEntryId: scrittura.id, status: 'MANUAL' })
    const risposta = await callRoute<{ error?: string }, { id: string }>(DELETE, jsonRequest(url(r.id), { method: 'DELETE' }), { id: r.id })
    expect(risposta.status).toBe(409)
  })
})

describe('azioni in blocco', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('sposta un elenco di id, e conta le righe toccate', async () => {
    const { venueId } = await contesto()
    const a = await riga(venueId, 'a')
    const b = await riga(venueId, 'b')
    await riga(venueId, 'c')
    const risposta = await callRoute<{ toccate: number; saltate: number }>(bloccoPOST, jsonRequest('http://localhost/api/bank-transactions/azioni-in-blocco', { method: 'POST', body: { azione: 'sposta', sezione: 'CBILL_PAGOPA', ids: [a.id, b.id] } }))
    expect(risposta.status).toBe(200)
    expect(risposta.body).toEqual({ toccate: 2, saltate: 0 })
    expect(await prisma.bankTransaction.count({ where: { venueId, sezione: 'CBILL_PAGOPA' } })).toBe(2)
    expect(await prisma.bankTransactionEdit.count({ where: { campo: 'sezione' } })).toBe(2)
  })

  // «Seleziona tutte le N del filtro»: il server rilegge il filtro, non una lista costruita dal client.
  it('cestina per filtro, e salta le righe con scrittura collegata', async () => {
    const { venueId, centroId } = await contesto()
    const scrittura = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-10'), registerType: 'BANK', description: 'x', creditAmount: 10, costCenterId: centroId } })
    await riga(venueId, 'commissione 1', { amount: -0.75 })
    await riga(venueId, 'commissione 2', { amount: -0.75 })
    await riga(venueId, 'collegata', { amount: -0.75, matchedEntryId: scrittura.id, status: 'MANUAL' })
    await riga(venueId, 'entrata', { amount: 100 })

    const risposta = await callRoute<{ toccate: number; saltate: number }>(bloccoPOST, jsonRequest('http://localhost/api/bank-transactions/azioni-in-blocco', { method: 'POST', body: { azione: 'cestino', filtro: { tipo: 'uscite' } } }))
    expect(risposta.body).toEqual({ toccate: 2, saltate: 1 })
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: { not: null } } })).toBe(2)
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: null } })).toBe(2)
  })

  it('senza ids né filtro risponde 400', async () => {
    const risposta = await callRoute(bloccoPOST, jsonRequest('http://localhost/api/bank-transactions/azioni-in-blocco', { method: 'POST', body: { azione: 'cestino' } }))
    expect(risposta.status).toBe(400)
  })
})
