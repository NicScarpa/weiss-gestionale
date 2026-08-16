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
const URL_BLOCCO = 'http://localhost/api/bank-transactions/azioni-in-blocco'

type EsitoBlocco = { toccate: number; saltate: number }

/** L'azione in blocco: il corpo è già l'unica cosa che cambia fra un caso e l'altro. */
function inBlocco(body: Record<string, unknown>) {
  return callRoute<EsitoBlocco>(bloccoPOST, jsonRequest(URL_BLOCCO, { method: 'POST', body }))
}

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
    const risposta = await inBlocco({ azione: 'sposta', sezione: 'CBILL_PAGOPA', ids: [a.id, b.id] })
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

    const risposta = await inBlocco({ azione: 'cestino', filtro: { tipo: 'uscite' } })
    expect(risposta.body).toEqual({ toccate: 2, saltate: 1 })
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: { not: null } } })).toBe(2)
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: null } })).toBe(2)
  })

  // Il `where` per `ripristina` chiede solo le righe nel Cestino: un id vivo
  // finito nell'elenco — la selezione fatta prima di cambiare scheda — non
  // deve contarsi fra le ripristinate, che sarebbe un numero gonfiato.
  it('ripristina per id riporta in vita le sole righe cestinate', async () => {
    const { venueId } = await contesto()
    const cestinata1 = await riga(venueId, 'cestinata 1', { deletedAt: new Date('2026-08-15') })
    const cestinata2 = await riga(venueId, 'cestinata 2', { deletedAt: new Date('2026-08-15') })
    const viva = await riga(venueId, 'viva')

    const risposta = await inBlocco({ azione: 'ripristina', ids: [cestinata1.id, cestinata2.id, viva.id] })
    expect(risposta.status).toBe(200)
    expect(risposta.body).toEqual({ toccate: 2, saltate: 0 })
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: { not: null } } })).toBe(0)
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: null } })).toBe(3)
  })

  // «Tutte le N del filtro» dal Cestino: il filtro è `cestino=1`, e il server
  // deve leggere le righe cancellate invece delle vive.
  it('ripristina per filtro svuota il Cestino e lascia stare il resto', async () => {
    const { venueId } = await contesto()
    await riga(venueId, 'cestinata 1', { deletedAt: new Date('2026-08-15') })
    await riga(venueId, 'cestinata 2', { deletedAt: new Date('2026-08-15') })
    await riga(venueId, 'viva')

    const risposta = await inBlocco({ azione: 'ripristina', filtro: { cestino: '1' } })
    expect(risposta.body).toEqual({ toccate: 2, saltate: 0 })
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: { not: null } } })).toBe(0)
    expect(await prisma.bankTransaction.count({ where: { venueId, deletedAt: null } })).toBe(3)
  })

  it('sposta per filtro tocca solo le righe di quella scheda, e ne scrive la cronologia', async () => {
    const { venueId } = await contesto()
    const f24a = await riga(venueId, 'f24 a', { sezione: 'DELEGHE_F24' })
    const f24b = await riga(venueId, 'f24 b', { sezione: 'DELEGHE_F24' })
    const attiva = await riga(venueId, 'attiva')

    const risposta = await inBlocco({ azione: 'sposta', sezione: 'ATTIVI', filtro: { sezione: 'DELEGHE_F24' } })
    expect(risposta.body).toEqual({ toccate: 2, saltate: 0 })
    expect(await prisma.bankTransaction.count({ where: { venueId, sezione: 'ATTIVI' } })).toBe(3)

    const cronologia = await prisma.bankTransactionEdit.findMany({ where: { bankTransactionId: { in: [f24a.id, f24b.id] } } })
    expect(cronologia).toHaveLength(2)
    expect(cronologia.every((c) => c.campo === 'sezione' && c.prima === 'DELEGHE_F24' && c.dopo === 'ATTIVI')).toBe(true)
    // La riga che era già su Attivi non è stata letta dal filtro: nessuna traccia.
    expect(await prisma.bankTransactionEdit.count({ where: { bankTransactionId: attiva.id } })).toBe(0)
  })

  // Il conteggio è di ciò che è cambiato: dire «2 movimenti spostati» quando
  // uno era già lì racconterebbe un'azione che non c'è stata, e la cronologia
  // si riempirebbe di righe con «prima» e «dopo» uguali.
  it('sposta salta le righe già nella scheda: «toccate» conta solo quelle cambiate', async () => {
    const { venueId } = await contesto()
    const daSpostare = await riga(venueId, 'da spostare')
    const gia = await riga(venueId, 'già lì', { sezione: 'CBILL_PAGOPA' })

    const risposta = await inBlocco({ azione: 'sposta', sezione: 'CBILL_PAGOPA', ids: [daSpostare.id, gia.id] })
    expect(risposta.body).toEqual({ toccate: 1, saltate: 0 })
    expect(await prisma.bankTransaction.count({ where: { venueId, sezione: 'CBILL_PAGOPA' } })).toBe(2)
    const cronologia = await prisma.bankTransactionEdit.findMany({ where: { campo: 'sezione' } })
    expect(cronologia.map((c) => c.bankTransactionId)).toEqual([daSpostare.id])
  })

  // «Sposta in» sul Cestino non c'è nella barra della selezione, ma il corpo
  // della richiesta si compone anche a mano: non deve rispondere 500. Il ciclo
  // di prima chiamava `update({ where: { id } })`, e l'estensione dei
  // cancellati logici ci infilava `deletedAt: null`: la riga non si trovava e
  // Prisma sollevava P2025. Insiemisticamente non si tocca nulla, e si dice.
  it('sposta per filtro sul Cestino non tocca nulla, senza rompersi', async () => {
    const { venueId } = await contesto()
    const cestinata = await riga(venueId, 'cestinata', { deletedAt: new Date('2026-08-15') })

    const risposta = await inBlocco({ azione: 'sposta', sezione: 'DELEGHE_F24', filtro: { cestino: '1' } })
    expect(risposta.status).toBe(200)
    expect(risposta.body).toEqual({ toccate: 0, saltate: 0 })
    const dopo = await prisma.bankTransaction.findFirstOrThrow({ where: { id: cestinata.id, deletedAt: { not: null } } })
    expect(dopo.sezione).toBe('ATTIVI')
    expect(await prisma.bankTransactionEdit.count({ where: { bankTransactionId: cestinata.id } })).toBe(0)
  })

  it('senza ids né filtro risponde 400', async () => {
    const risposta = await inBlocco({ azione: 'cestino' })
    expect(risposta.status).toBe(400)
  })
})
