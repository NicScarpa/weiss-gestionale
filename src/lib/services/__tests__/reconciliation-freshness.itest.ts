import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { aggiornaFreschezza } from '../reconciliation-freshness'

/**
 * CashKing conserva le proposte e basta, e ha dovuto aggiungere un contatore
 * "superseded" e un triangolo di conflitto per rattoppare a valle il fatto che
 * una proposta possa riferirsi a una fattura già pagata. Qui il controllo
 * avviene alla rilettura, prima che l'utente veda qualcosa.
 */
setupIntegrationDb()

async function lottoConUnaProposta(venueId: string) {
  const movimento = await prisma.bankTransaction.create({
    data: {
      venueId,
      transactionDate: new Date('2026-07-07'),
      description: 'Bonifico',
      amount: -100,
      status: 'PENDING',
    },
  })
  const scadenza = await creaScadenza({
    venueId,
    tipo: 'passiva',
    importoTotale: 100,
    dataScadenza: new Date('2026-07-07'),
    descrizione: 'Scadenza',
  })
  const lotto = await prisma.reconciliationBatch.create({
    data: {
      venueId,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regoleUsate: ['R1'],
      contaProposte: 1,
    },
  })
  const proposta = await prisma.reconciliationProposal.create({
    data: {
      batchId: lotto.id,
      regola: 'R1',
      punteggio: 90,
      fattori: {},
      motivazioni: [],
      bankTransactionId: movimento.id,
      gambe: { create: [{ scheduleId: scadenza.id, importo: 100 }] },
    },
  })
  return { movimento, scadenza, lotto, proposta }
}

describe('aggiornaFreschezza', () => {
  it('lascia stare una proposta le cui due parti sono ancora aperte', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta } = await lottoConUnaProposta(venue.id)

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(0)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('in_attesa')
  })

  it('marca superata la proposta la cui scadenza è stata saldata altrove', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta, scadenza } = await lottoConUnaProposta(venue.id)

    await prisma.schedule.update({
      where: { id: scadenza.id },
      data: { stato: 'pagata', importoPagato: 100 },
    })

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(1)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('superata')
  })

  it('marca superata la proposta il cui movimento è già stato riconciliato', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta, movimento } = await lottoConUnaProposta(venue.id)

    await prisma.bankTransaction.update({
      where: { id: movimento.id },
      data: { status: 'MATCHED' },
    })

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(1)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('superata')
  })

  it('non tocca le proposte già decise', async () => {
    const venue = await venueDiTest()
    const { lotto, proposta, scadenza } = await lottoConUnaProposta(venue.id)

    await prisma.reconciliationProposal.update({
      where: { id: proposta.id },
      data: { stato: 'approvata' },
    })
    await prisma.schedule.update({
      where: { id: scadenza.id },
      data: { stato: 'pagata', importoPagato: 100 },
    })

    expect(await aggiornaFreschezza(lotto.id, venue.id)).toBe(0)

    const dopo = await prisma.reconciliationProposal.findUniqueOrThrow({ where: { id: proposta.id } })
    expect(dopo.stato).toBe('approvata')
  })

  it('aggiorna il contatore delle superate sul lotto', async () => {
    const venue = await venueDiTest()
    const { lotto, scadenza } = await lottoConUnaProposta(venue.id)

    await prisma.schedule.update({
      where: { id: scadenza.id },
      data: { stato: 'annullata' },
    })

    await aggiornaFreschezza(lotto.id, venue.id)

    const dopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: lotto.id } })
    expect(dopo.contaSuperate).toBe(1)
  })
})
