import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { generaLotto } from '../reconciliation-batch-service'

/**
 * La generazione del lotto su database vero.
 *
 * Il criterio che questi test difendono, e che vale più di ogni singolo caso:
 * la somma delle fasce deve fare il totale in attesa. È il difetto più visibile
 * di CashKing — "In attesa: 0" con nove abbinamenti ancora da decidere — e
 * nasce dal contare proposte in un posto e schede in un altro.
 */
setupIntegrationDb()

async function creaMovimentoBancario(
  venueId: string,
  over: Partial<{ importo: number; data: Date; causale: string; codice: string | null }> = {}
) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      transactionDate: over.data ?? new Date('2026-07-07'),
      description: over.causale ?? 'BEN ROMA GIANFRANCO SRLFT 4320 Causale: FT 4320',
      amount: over.importo ?? -846.95,
      bankTransactionCode: over.codice ?? null,
      status: 'PENDING',
    },
  })
}

describe('generaLotto', () => {
  it('propone l\'abbinamento evidente e lo mette in fascia alta', async () => {
    const venue = await venueDiTest()
    const movimento = await creaMovimentoBancario(venue.id)
    const scadenza = await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 846.95,
      dataScadenza: new Date('2026-07-07'),
      numeroDocumento: '4320',
      controparteNome: 'ROMA GIANFRANCO SRL',
      descrizione: 'Roma Gianfranco SRL — fattura 4320',
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.contaProposte).toBe(1)

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
      include: { gambe: true },
    })
    expect(proposte).toHaveLength(1)
    expect(proposte[0].punteggio).toBeGreaterThanOrEqual(85)
    expect(proposte[0].bankTransactionId).toBe(movimento.id)
    expect(proposte[0].gambe).toHaveLength(1)
    expect(proposte[0].gambe[0].scheduleId).toBe(scadenza.id)
  })

  it('non propone nulla sotto la soglia minima', async () => {
    const venue = await venueDiTest()
    await creaMovimentoBancario(venue.id, {
      importo: -12.34,
      causale: 'Addebito commissioni trimestrali',
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 5000,
      dataScadenza: new Date('2026-01-01'),
      numeroDocumento: null,
      controparteNome: 'ALTRO FORNITORE SPA',
      descrizione: 'Altro fornitore',
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.contaProposte).toBe(0)
  })

  it('salta le coppie escluse per sempre', async () => {
    const venue = await venueDiTest()
    const movimento = await creaMovimentoBancario(venue.id)
    const scadenza = await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 846.95,
      dataScadenza: new Date('2026-07-07'),
      numeroDocumento: '4320',
      controparteNome: 'ROMA GIANFRANCO SRL',
      descrizione: 'Roma Gianfranco SRL — fattura 4320',
    })
    await prisma.reconciliationExclusion.create({
      data: { venueId: venue.id, bankTransactionId: movimento.id, scheduleId: scadenza.id },
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.contaProposte).toBe(0)
  })

  it('usa un alias appreso per riconoscere una controparte scritta diversamente', async () => {
    const venue = await venueDiTest()
    const fornitore = await prisma.supplier.create({
      data: { name: 'Roma Gianfranco S.r.l.' },
    })
    await prisma.counterpartyAlias.create({
      data: {
        venueId: venue.id,
        testoNormalizzato: 'BEN ROMA GIANFRANCO SRLFT 4320 CAUSALE FT 4320',
        supplierId: fornitore.id,
        origine: 'manuale',
      },
    })
    await creaMovimentoBancario(venue.id)
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 846.95,
      dataScadenza: new Date('2026-07-07'),
      numeroDocumento: null, // niente riferimento: la controparte deve bastare
      controparteNome: 'DENOMINAZIONE INTERNA DIVERSA',
      supplierId: fornitore.id,
      descrizione: 'Fornitore',
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
    })
    expect(proposte).toHaveLength(1)
    const fattori = proposte[0].fattori as { controparte: number }
    expect(fattori.controparte).toBe(20)
  })

  it('la somma delle fasce fa il totale in attesa', async () => {
    const venue = await venueDiTest()
    for (const n of [1, 2, 3]) {
      await creaMovimentoBancario(venue.id, {
        importo: -(100 * n),
        causale: `Bonifico a FORNITORE ${n} Causale: FT 10${n}`,
        data: new Date('2026-07-07'),
      })
      await creaScadenza({
        venueId: venue.id,
        tipo: 'passiva',
        importoTotale: 100 * n,
        dataScadenza: new Date(2026, 6, 7 + n * 3),
        numeroDocumento: `10${n}`,
        controparteNome: `FORNITORE ${n}`,
        descrizione: `Fornitore ${n}`,
      })
    }

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1'],
      userId: null,
    })

    expect(esito.perFascia.alta + esito.perFascia.media + esito.perFascia.bassa).toBe(
      esito.contaProposte
    )
  })
})
