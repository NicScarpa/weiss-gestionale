import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { POST as categorizza } from '../[id]/categorizza/route'
import { POST as collega } from '../[id]/collega/route'
import { POST as scollega } from '../[id]/scollega/route'
import { POST as inBlocco } from '../categorizza-in-blocco/route'

setupIntegrationDb()

async function contesto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  const contoCosto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR' } })
  return { venueId: venue.id, contoId: conto.id, contoCostoId: contoCosto.id }
}

async function riga(venueId: string, contoId: string, importo: number, extra: { sezione?: 'ATTIVI' | 'DELEGHE_F24' | 'CBILL_PAGOPA'; deletedAt?: Date } = {}) {
  return prisma.bankTransaction.create({
    data: {
      venueId, bankAccountId: contoId, transactionDate: new Date('2026-08-10'),
      description: 'Commissioni', descrizione: null, causale: 'Commissioni', amount: importo,
      importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: extra.sezione ?? 'ATTIVI', deletedAt: extra.deletedAt ?? null,
    },
  })
}

type Corpo = { error?: string; code?: string; ok?: boolean; journalEntryId?: string; residuo?: number; creata?: boolean; scritturaRitirata?: boolean; toccate?: number; saltate?: number; dettagli?: Array<{ id: string; motivo: string }> }

const post = (handler: Parameters<typeof callRoute>[0], url: string, id: string | null, body?: unknown) =>
  id
    ? callRoute<Corpo, { id: string }>(handler, jsonRequest(url, { method: 'POST', body }), { id })
    : callRoute<Corpo>(handler, jsonRequest(url, { method: 'POST', body }))

describe('le azioni contabili sull\'estratto conto', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('POST categorizza promuove la riga e risponde con la scrittura', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const r = await riga(venueId, contoId, -0.75)
    const risposta = await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: contoCostoId })
    expect(risposta.status).toBe(200)
    expect(risposta.body.creata).toBe(true)
    expect(risposta.body.residuo).toBe(0)
    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })
    expect(dopo.matchedEntryId).toBe(risposta.body.journalEntryId)
    expect(dopo.origineScrittura).toBe('CATEGORIZZA')
  })

  it('POST categorizza rifiuta per forma un corpo con campi in più o senza conto', async () => {
    const { venueId, contoId } = await contesto()
    const r = await riga(venueId, contoId, -1)
    expect((await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, {})).status).toBe(400)
    expect((await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: 'x', amount: 5 })).status).toBe(400)
  })

  it('POST collega con le scadenze; l\'eccedenza è un 422 col residuo', async () => {
    const { venueId, contoId } = await contesto()
    const s = await creaScadenza({ importoTotale: 100 })
    const r = await riga(venueId, contoId, -100)
    const troppo = await post(collega, `http://localhost/api/bank-transactions/${r.id}/collega`, r.id, { scadenze: [{ scheduleId: s.id, amount: 120 }] })
    expect(troppo.status).toBe(422)
    expect(troppo.body.residuo).toBe(100)

    const ok = await post(collega, `http://localhost/api/bank-transactions/${r.id}/collega`, r.id, { scadenze: [{ scheduleId: s.id, amount: 100 }] })
    expect(ok.status).toBe(200)
    expect(ok.body.residuo).toBe(0)
  })

  it('POST collega con una scrittura esistente (R4), e la stessa scrittura per una seconda riga è un 409', async () => {
    const { venueId, contoId } = await contesto()
    const esistente = await creaMovimento({ uscita: 50 })
    const prima = await riga(venueId, contoId, -50)
    const seconda = await riga(venueId, contoId, -50)
    expect((await post(collega, `http://localhost/api/bank-transactions/${prima.id}/collega`, prima.id, { scritturaEsistenteId: esistente.id })).status).toBe(200)
    expect((await post(collega, `http://localhost/api/bank-transactions/${seconda.id}/collega`, seconda.id, { scritturaEsistenteId: esistente.id })).status).toBe(409)
    // Le due forme insieme sono un 400.
    expect((await post(collega, `http://localhost/api/bank-transactions/${seconda.id}/collega`, seconda.id, { scritturaEsistenteId: esistente.id, scadenze: [] })).status).toBe(400)
  })

  it('POST scollega riporta la riga a PENDING; su una riga inesistente è 404', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const r = await riga(venueId, contoId, -0.75)
    await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: contoCostoId })
    const risposta = await post(scollega, `http://localhost/api/bank-transactions/${r.id}/scollega`, r.id)
    expect(risposta.status).toBe(200)
    expect(risposta.body.scritturaRitirata).toBe(true)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('PENDING')
    expect((await post(scollega, 'http://localhost/api/bank-transactions/nessuna/scollega', 'nessuna')).status).toBe(404)
  })

  it('POST categorizza-in-blocco per id e per filtro, con le saltate spiegate', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const a = await riga(venueId, contoId, -0.75)
    const b = await riga(venueId, contoId, -0.5)
    const nelCestino = await riga(venueId, contoId, -0.25, { deletedAt: new Date() })
    const f24 = await riga(venueId, contoId, -300, { sezione: 'DELEGHE_F24' })

    const perId = await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, {
      ids: [a.id, b.id, nelCestino.id], imputazione: { accountId: contoCostoId },
    })
    expect(perId.status).toBe(200)
    expect(perId.body.toccate).toBe(2)
    expect(perId.body.saltate).toBe(1)
    expect(perId.body.dettagli?.[0]?.id).toBe(nelCestino.id)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(2)

    // Il filtro è quello della lista: la scheda Deleghe F24 prende solo la delega.
    const perFiltro = await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, {
      filtro: { sezione: 'DELEGHE_F24' }, imputazione: { accountId: contoCostoId },
    })
    expect(perFiltro.body).toMatchObject({ toccate: 1, saltate: 0 })
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: f24.id } })).matchedEntryId).not.toBeNull()

    // Ricategorizzare le stesse righe non crea altre scritture.
    const di_nuovo = await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, { ids: [a.id, b.id], imputazione: { accountId: contoCostoId } })
    expect(di_nuovo.body.toccate).toBe(2)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(3)
  })

  it('come staff tutte e quattro rispondono 403', async () => {
    logout()
    await entraCome('staff')
    const { venueId, contoId, contoCostoId } = await contesto()
    const r = await riga(venueId, contoId, -1)
    expect((await post(categorizza, `http://localhost/api/bank-transactions/${r.id}/categorizza`, r.id, { accountId: contoCostoId })).status).toBe(403)
    expect((await post(collega, `http://localhost/api/bank-transactions/${r.id}/collega`, r.id, { scritturaEsistenteId: 'x' })).status).toBe(403)
    expect((await post(scollega, `http://localhost/api/bank-transactions/${r.id}/scollega`, r.id)).status).toBe(403)
    expect((await post(inBlocco, 'http://localhost/api/bank-transactions/categorizza-in-blocco', null, { ids: [r.id], imputazione: { accountId: contoCostoId } })).status).toBe(403)
  })
})
