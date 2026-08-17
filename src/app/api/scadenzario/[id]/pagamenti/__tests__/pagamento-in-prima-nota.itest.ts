import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { POST } from '../route'

/**
 * Registrare un pagamento su una scadenza deve scrivere anche in prima nota.
 *
 * Il ponte fra scadenza e contabilità esiste da sempre (`ScheduleReconciliation`:
 * la scadenza dice cosa va pagato, il movimento porta l'imputazione, il ponte
 * li unisce) e la riconciliazione lo percorre — dal movimento bancario nasce
 * il pagamento sulla scadenza. Mancava la direzione opposta: registrando il
 * pagamento *dalla scadenza*, la scrittura non nasceva e il ponte restava
 * vuoto. Lo scadenzario diceva «pagata», i libri non se ne accorgevano.
 *
 * Le due direzioni devono produrre la stessa struttura, non due modi diversi
 * di dire la stessa cosa: qui si verifica proprio quello.
 */

setupIntegrationDb()

type Corpo = {
  error?: string
  payment?: { id: string }
  journalEntry?: { id: string }
}

async function contesto() {
  const venue = await prisma.venue.findFirstOrThrow()
  const conto = await prisma.account.findFirstOrThrow({
    where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR' },
  })
  return { venueId: venue.id, accountId: conto.id }
}

async function paga(
  scheduleId: string,
  corpo: Record<string, unknown>
) {
  return callRoute<Corpo, { id: string }>(
    POST,
    jsonRequest(`http://localhost/api/scadenzario/${scheduleId}/pagamenti`, {
      method: 'POST',
      body: corpo,
    }),
    { id: scheduleId }
  )
}

beforeEach(async () => {
  logout()
  await entraCome('admin')
})

describe('il pagamento di una scadenza entra in prima nota', () => {
  it('crea la scrittura con importo, data e conto scelti', async () => {
    const { venueId, accountId } = await contesto()
    const scadenza = await creaScadenza({ venueId, importoTotale: 100, descrizione: 'Fattura Caffè Trieste' })

    const esito = await paga(scadenza.id, {
      importo: 100,
      dataPagamento: '2026-08-10',
      metodo: 'bonifico',
      accountId,
    })

    expect(esito.status).toBe(200)

    const scritture = await prisma.journalEntry.findMany({ where: { venueId } })
    expect(scritture).toHaveLength(1)
    expect(Number(scritture[0].creditAmount ?? 0)).toBe(100)
    expect(scritture[0].accountId).toBe(accountId)
    expect(scritture[0].date.toISOString().slice(0, 10)).toBe('2026-08-10')
  })

  it('collega scrittura, scadenza e pagamento sullo stesso ponte', async () => {
    const { venueId, accountId } = await contesto()
    const scadenza = await creaScadenza({ venueId, importoTotale: 100 })

    const esito = await paga(scadenza.id, {
      importo: 100,
      dataPagamento: '2026-08-10',
      metodo: 'bonifico',
      accountId,
    })

    const legame = await prisma.scheduleReconciliation.findFirstOrThrow({
      where: { scheduleId: scadenza.id },
    })
    const scrittura = await prisma.journalEntry.findFirstOrThrow({ where: { venueId } })

    expect(legame.journalEntryId).toBe(scrittura.id)
    expect(legame.paymentId).toBe(esito.body.payment?.id)
    expect(Number(legame.amount)).toBe(100)
  })

  it('il metodo decide il registro: contanti in cassa, il resto in banca', async () => {
    const { venueId, accountId } = await contesto()
    const inCassa = await creaScadenza({ venueId, importoTotale: 50 })
    const inBanca = await creaScadenza({ venueId, importoTotale: 50 })

    await paga(inCassa.id, { importo: 50, dataPagamento: '2026-08-10', metodo: 'contanti', accountId })
    await paga(inBanca.id, { importo: 50, dataPagamento: '2026-08-10', metodo: 'bonifico', accountId })

    const scritture = await prisma.journalEntry.findMany({ orderBy: { createdAt: 'asc' } })
    expect(scritture.map((s) => s.registerType)).toEqual(['CASH', 'BANK'])
  })

  it('una scadenza attiva genera un\'entrata, non un\'uscita', async () => {
    const { venueId } = await contesto()
    const conto = await prisma.account.findFirstOrThrow({
      where: { type: 'RICAVO', isActive: true },
    })
    const centro = await prisma.costCenter.findFirstOrThrow({ where: { isActive: true } })
    const scadenza = await creaScadenza({ venueId, tipo: 'attiva', importoTotale: 200 })

    await paga(scadenza.id, {
      importo: 200,
      dataPagamento: '2026-08-10',
      metodo: 'bonifico',
      accountId: conto.id,
      costCenterId: centro.id,
    })

    const scrittura = await prisma.journalEntry.findFirstOrThrow({ where: { venueId } })
    expect(Number(scrittura.debitAmount ?? 0)).toBe(200)
    expect(scrittura.creditAmount).toBeNull()
  })

  it('il conto che pretende un centro di costo lo pretende anche qui', async () => {
    // Non è un capriccio del test: se il conto scelto esige un centro, il
    // pagamento va rifiutato finché non gliene si indica uno — ed è la ragione
    // per cui la finestra del pagamento deve poterlo chiedere, altrimenti il
    // rifiuto indicherebbe un'azione impossibile da compiere.
    const { venueId } = await contesto()
    const obbligatorio = await prisma.account.findFirst({
      where: { isActive: true, costCenterRule: 'OBBLIGATORIO' },
    })
    if (!obbligatorio) return

    const scadenza = await creaScadenza({ venueId, importoTotale: 100 })

    const senzaCentro = await paga(scadenza.id, {
      importo: 100,
      dataPagamento: '2026-08-10',
      metodo: 'bonifico',
      accountId: obbligatorio.id,
    })
    expect(senzaCentro.status).toBe(422)
    expect(senzaCentro.body.error).toContain('centro di costo')

    const centro = await prisma.costCenter.findFirstOrThrow({ where: { isActive: true } })
    const conCentro = await paga(scadenza.id, {
      importo: 100,
      dataPagamento: '2026-08-10',
      metodo: 'bonifico',
      accountId: obbligatorio.id,
      costCenterId: centro.id,
    })
    expect(conCentro.status).toBe(200)

    const scrittura = await prisma.journalEntry.findFirstOrThrow({ where: { venueId } })
    expect(scrittura.costCenterId).toBe(centro.id)
  })

  it('senza conto il pagamento non si registra', async () => {
    const { venueId } = await contesto()
    const scadenza = await creaScadenza({ venueId, importoTotale: 100 })

    const esito = await paga(scadenza.id, {
      importo: 100,
      dataPagamento: '2026-08-10',
      metodo: 'bonifico',
    })

    expect(esito.status).toBe(400)
    expect(await prisma.schedulePayment.count()).toBe(0)
  })

  it('se il centro di costo non si risolve, non resta niente a metà', async () => {
    // È l'invariante che dà senso a tutto il resto: non deve esistere uno
    // stato in cui la scadenza risulta pagata e i libri non lo sanno. O
    // entrano insieme, o non entra nulla.
    const { venueId, accountId } = await contesto()
    const scadenza = await creaScadenza({ venueId, importoTotale: 100 })

    const esito = await paga(scadenza.id, {
      importo: 100,
      dataPagamento: '2026-08-10',
      metodo: 'bonifico',
      accountId,
      costCenterId: 'centro-che-non-esiste',
    })

    expect(esito.status).toBe(422)
    expect(await prisma.schedulePayment.count()).toBe(0)
    expect(await prisma.journalEntry.count()).toBe(0)
    expect(await prisma.scheduleReconciliation.count()).toBe(0)
  })

  it('il pagamento parziale porta in prima nota solo la quota pagata', async () => {
    const { venueId, accountId } = await contesto()
    const scadenza = await creaScadenza({ venueId, importoTotale: 100 })

    await paga(scadenza.id, { importo: 40, dataPagamento: '2026-08-10', metodo: 'bonifico', accountId })

    const scrittura = await prisma.journalEntry.findFirstOrThrow({ where: { venueId } })
    expect(Number(scrittura.creditAmount ?? 0)).toBe(40)

    const aggiornata = await prisma.schedule.findUniqueOrThrow({ where: { id: scadenza.id } })
    expect(aggiornata.stato).toBe('parzialmente_pagata')
  })
})
