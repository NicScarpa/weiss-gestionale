import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import type { RispostaEstrattoConto, ReconciliationStatus } from '@/types/reconciliation'
import { GET } from '../route'

setupIntegrationDb()

async function contesto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  const centro = await prisma.costCenter.findFirstOrThrow()
  return { venueId: venue.id, contoId: conto.id, centroId: centro.id }
}

async function riga(venueId: string, contoId: string, dati: { data: string; importo: number; descrizione: string; causale?: string; sezione?: 'ATTIVI' | 'DELEGHE_F24' | 'CBILL_PAGOPA'; deletedAt?: Date; matchedEntryId?: string; status?: ReconciliationStatus; residuoDocumenti?: number }) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      bankAccountId: contoId,
      transactionDate: new Date(dati.data),
      description: dati.descrizione,
      descrizione: dati.descrizione,
      causale: dati.causale ?? null,
      amount: dati.importo,
      importSource: 'PSD2_GOCARDLESS',
      status: dati.status ?? 'PENDING',
      sezione: dati.sezione ?? 'ATTIVI',
      deletedAt: dati.deletedAt ?? null,
      matchedEntryId: dati.matchedEntryId ?? null,
      residuoDocumenti: dati.residuoDocumenti ?? null,
    },
  })
}

async function lista(query: string) {
  return callRoute<RispostaEstrattoConto>(GET, jsonRequest(`http://localhost/api/bank-transactions?${query}`))
}

describe('GET /api/bank-transactions — la lista dell\'estratto conto', () => {
  beforeEach(async () => {
    logout()
    await entraCome('admin')
  })

  it('ordina lato server per importo, nei due versi', async () => {
    const { venueId, contoId } = await contesto()
    await riga(venueId, contoId, { data: '2026-08-01', importo: -50, descrizione: 'B' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: 200, descrizione: 'A' })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -10, descrizione: 'C' })

    const asc = await lista('ordina=importo&verso=asc')
    expect(asc.body.data.map((r) => r.amount)).toEqual([-50, -10, 200])
    const desc = await lista('ordina=importo&verso=desc')
    expect(desc.body.data.map((r) => r.amount)).toEqual([200, -10, -50])
  })

  it('i totali seguono il filtro, i conteggi delle schede no', async () => {
    const { venueId, contoId } = await contesto()
    await riga(venueId, contoId, { data: '2026-08-01', importo: 100, descrizione: 'entrata' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -40, descrizione: 'uscita' })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -5, descrizione: 'f24', sezione: 'DELEGHE_F24' })
    await riga(venueId, contoId, { data: '2026-08-04', importo: -1, descrizione: 'cestinata', deletedAt: new Date() })

    const attivi = await lista('')
    expect(attivi.body.totali).toEqual({ entrate: 100, uscite: 40, saldoNetto: 60 })
    expect(attivi.body.conteggi).toEqual({ attivi: 2, delegheF24: 1, cbillPagopa: 0, cestino: 1 })
    expect(attivi.body.data.map((r) => r.descrizione)).toEqual(['uscita', 'entrata'])

    const soloUscite = await lista('tipo=uscite')
    expect(soloUscite.body.totali).toEqual({ entrate: 0, uscite: 40, saldoNetto: -40 })
    expect(soloUscite.body.conteggi.attivi).toBe(2)

    const cestino = await lista('cestino=1')
    expect(cestino.body.data.map((r) => r.descrizione)).toEqual(['cestinata'])
  })

  it('cerca su descrizione, causale, note e testo grezzo', async () => {
    const { venueId, contoId } = await contesto()
    await riga(venueId, contoId, { data: '2026-08-01', importo: -1, descrizione: 'ROSSI SRL', causale: 'Bonifico a vs favore' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -2, descrizione: 'altro' })
    expect((await lista('search=rossi')).body.data).toHaveLength(1)
    expect((await lista('search=bonifico')).body.data).toHaveLength(1)
    expect((await lista('search=nessuno')).body.data).toHaveLength(0)
  })

  it('calcola lo stato della legenda per riga, dalla colonna del residuo', async () => {
    const { venueId, contoId, centroId } = await contesto()
    const conto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true } })
    const scrittura = await prisma.journalEntry.create({
      data: { venueId, date: new Date('2026-08-01'), registerType: 'BANK', description: 'Commissioni', creditAmount: 0.75, costCenterId: centroId, accountId: conto.id },
    })
    const parziale = await prisma.journalEntry.create({
      data: { venueId, date: new Date('2026-08-02'), registerType: 'BANK', description: 'Bonifico', creditAmount: 100, costCenterId: centroId },
    })
    await riga(venueId, contoId, { data: '2026-08-01', importo: -0.75, descrizione: 'commissione', matchedEntryId: scrittura.id, status: 'MANUAL', residuoDocumenti: 0 })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -100, descrizione: 'parziale', matchedEntryId: parziale.id, status: 'MANUAL', residuoDocumenti: 40 })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -20, descrizione: 'libera' })

    const tutte = await lista('ordina=data&verso=asc')
    expect(tutte.body.data.map((r) => [r.descrizione, r.stato, r.residuo])).toEqual([
      ['commissione', 'abbinato_manualmente', 0],
      ['parziale', 'parziale', 40],
      ['libera', 'non_abbinato', 20],
    ])
    // La Categoria viene dalla scrittura collegata.
    expect(tutte.body.data[0].matchedEntry?.account?.code).toBe(conto.code)
    expect(tutte.body.data[0].matchedEntry?.costCenter?.id).toBe(centroId)
    expect(tutte.body.data[2].matchedEntry).toBeNull()
  })

  it('«Solo non riconciliati» prende le libere, i parziali e le proposte da rivedere', async () => {
    const { venueId, contoId, centroId } = await contesto()
    const s1 = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-01'), registerType: 'BANK', description: 'a', creditAmount: 10, costCenterId: centroId } })
    const s2 = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-02'), registerType: 'BANK', description: 'b', creditAmount: 10, costCenterId: centroId } })
    const s3 = await prisma.journalEntry.create({ data: { venueId, date: new Date('2026-08-03'), registerType: 'BANK', description: 'c', creditAmount: 10, costCenterId: centroId } })
    await riga(venueId, contoId, { data: '2026-08-01', importo: -10, descrizione: 'chiusa', matchedEntryId: s1.id, status: 'MANUAL', residuoDocumenti: 0 })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -10, descrizione: 'parziale', matchedEntryId: s2.id, status: 'MANUAL', residuoDocumenti: 4 })
    await riga(venueId, contoId, { data: '2026-08-03', importo: -10, descrizione: 'proposta', matchedEntryId: s3.id, status: 'TO_REVIEW', residuoDocumenti: 0 })
    await riga(venueId, contoId, { data: '2026-08-04', importo: -10, descrizione: 'libera' })

    const aperte = await lista('soloNonRiconciliati=1&ordina=data&verso=asc')
    expect(aperte.body.data.map((r) => [r.descrizione, r.stato, r.proposta])).toEqual([
      ['parziale', 'parziale', false],
      ['proposta', 'non_abbinato', true],
      ['libera', 'non_abbinato', false],
    ])
  })

  it('«movimento» restringe la lista a una riga sola', async () => {
    const { venueId, contoId } = await contesto()
    const una = await riga(venueId, contoId, { data: '2026-08-01', importo: -1, descrizione: 'una' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -2, descrizione: 'altra' })
    const sola = await lista(`movimento=${una.id}`)
    expect(sola.body.data.map((r) => r.descrizione)).toEqual(['una'])
    expect(sola.body.pagination.total).toBe(1)
  })

  // La pagina /riconciliazione (consegna B non ancora arrivata) manda ancora
  // `?status=TO_REVIEW`: senza questo filtro tornerebbe tutto, non solo le
  // righe da rivedere.
  it('filtra per stato, per la pagina di riconciliazione', async () => {
    const { venueId, contoId } = await contesto()
    await riga(venueId, contoId, { data: '2026-08-01', importo: -5, descrizione: 'da rivedere', status: 'TO_REVIEW' })
    await riga(venueId, contoId, { data: '2026-08-02', importo: -6, descrizione: 'in attesa' })

    const daRivedere = await lista('status=TO_REVIEW')
    expect(daRivedere.body.data.map((r) => r.descrizione)).toEqual(['da rivedere'])
  })

  it('come staff risponde 403', async () => {
    logout()
    await entraCome('staff')
    expect((await lista('')).status).toBe(403)
  })
})
