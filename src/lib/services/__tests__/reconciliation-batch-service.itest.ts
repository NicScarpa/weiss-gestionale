import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza, creaFattura, fornitoreDiTest } from '@/test/integration/fixtures/scadenzario'
import { generaLotto } from '../reconciliation-batch-service'

/**
 * La generazione del lotto su database vero.
 *
 * Il criterio che questi test difendono, e che vale più di ogni singolo caso:
 * la somma delle fasce deve fare il totale in attesa. È il difetto più visibile
 * di CashKing — "In attesa: 0" con nove abbinamenti ancora da decidere — e
 * nasce dal contare proposte in un posto e schede in un altro.
 *
 * Quasi tutti i casi qui chiedono `['R1','R2','R3']` e non la sola `R1`: le
 * regole **restringono le candidate**, e una scadenza senza `invoiceId` è una
 * R3. Chiedere `['R1']` a una fixture senza fattura la escluderebbe dal
 * calcolo, e i test che si aspettano zero proposte passerebbero per il motivo
 * sbagliato. Il filtro in sé ha un caso dedicato in fondo.
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
      regole: ['R1', 'R2', 'R3'],
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
      regole: ['R1', 'R2', 'R3'],
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
      regole: ['R1', 'R2', 'R3'],
      userId: null,
    })

    expect(esito.contaProposte).toBe(0)
  })

  it('usa un alias appreso per riconoscere una controparte scritta diversamente', async () => {
    const venue = await venueDiTest()
    // Un fornitore qualsiasi del seed: la sua ragione sociale non conta,
    // qui serve solo un id valido a cui appendere l'alias — il punteggio
    // dell'alias non guarda affatto `supplier.name` (vedi `punteggio.ts`,
    // ramo 1 di `punteggioControparte`).
    const fornitore = await fornitoreDiTest()
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
      regole: ['R1', 'R2', 'R3'],
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
      regole: ['R1', 'R2', 'R3'],
      userId: null,
    })

    expect(esito.perFascia.alta + esito.perFascia.media + esito.perFascia.bassa).toBe(
      esito.contaProposte
    )
  })

  it('assegna R1 alla passiva con fattura, R2 all\'attiva con fattura, R3 senza fattura', async () => {
    const venue = await venueDiTest()

    const fatturaPassiva = await creaFattura({
      venueId: venue.id,
      totalAmount: 300,
      invoiceNumber: 'FT-301',
    })
    await creaMovimentoBancario(venue.id, {
      importo: -300,
      causale: 'Bonifico a ROMA UNO SRL Causale: FT301',
      data: new Date('2026-07-10'),
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 300,
      dataScadenza: new Date('2026-07-10'),
      numeroDocumento: 'FT301',
      controparteNome: 'ROMA UNO SRL',
      invoiceId: fatturaPassiva.id,
      descrizione: 'Roma Uno SRL — fattura 301',
    })

    const fatturaAttiva = await creaFattura({
      venueId: venue.id,
      totalAmount: 400,
      invoiceNumber: 'FT-302',
    })
    await creaMovimentoBancario(venue.id, {
      importo: 400,
      causale: 'Bonifico da CLIENTE DUE SRL Causale: FT302',
      data: new Date('2026-07-11'),
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'attiva',
      importoTotale: 400,
      dataScadenza: new Date('2026-07-11'),
      numeroDocumento: 'FT302',
      controparteNome: 'CLIENTE DUE SRL',
      invoiceId: fatturaAttiva.id,
      descrizione: 'Cliente Due SRL — fattura 302',
    })

    await creaMovimentoBancario(venue.id, {
      importo: -500,
      causale: 'Bonifico a FORNITORE TRE SRL Causale: FT303',
      data: new Date('2026-07-12'),
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 500,
      dataScadenza: new Date('2026-07-12'),
      numeroDocumento: 'FT303',
      controparteNome: 'FORNITORE TRE SRL',
      invoiceId: null,
      descrizione: 'Fornitore Tre SRL — fattura 303',
    })

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1', 'R2', 'R3'],
      userId: null,
    })

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
      include: { gambe: true },
    })
    expect(proposte).toHaveLength(3)

    const regolaPerQuota = (importo: number) =>
      proposte.find((p) => Math.abs(Number(p.gambe[0]?.importo ?? 0) - importo) < 0.01)?.regola

    expect(regolaPerQuota(300)).toBe('R1')
    expect(regolaPerQuota(400)).toBe('R2')
    expect(regolaPerQuota(500)).toBe('R3')
  })

  it('un lotto chiesto con la sola R1 non contiene proposte R2 o R3', async () => {
    // Il parametro `regole` non è decorativo: restringe le candidate. Prima
    // finiva unicamente in `regoleUsate`, e chiedere R1 generava comunque R2 e
    // R3 perché la sigla veniva assegnata a posteriori — una casella della UI
    // che non fa nulla, e uno storico che documenta un'esecuzione mai avvenuta.
    const venue = await venueDiTest()

    const fatturaPassiva = await creaFattura({
      venueId: venue.id,
      totalAmount: 300,
      invoiceNumber: 'FT-401',
    })
    await creaMovimentoBancario(venue.id, {
      importo: -300,
      causale: 'Bonifico a ROMA UNO SRL Causale: FT401',
      data: new Date('2026-07-10'),
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 300,
      dataScadenza: new Date('2026-07-10'),
      numeroDocumento: 'FT401',
      controparteNome: 'ROMA UNO SRL',
      invoiceId: fatturaPassiva.id,
      descrizione: 'Roma Uno SRL — fattura 401',
    })

    // Una R2: attiva con fattura
    const fatturaAttiva = await creaFattura({
      venueId: venue.id,
      totalAmount: 400,
      invoiceNumber: 'FT-402',
    })
    await creaMovimentoBancario(venue.id, {
      importo: 400,
      causale: 'Bonifico da CLIENTE DUE SRL Causale: FT402',
      data: new Date('2026-07-11'),
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'attiva',
      importoTotale: 400,
      dataScadenza: new Date('2026-07-11'),
      numeroDocumento: 'FT402',
      controparteNome: 'CLIENTE DUE SRL',
      invoiceId: fatturaAttiva.id,
      descrizione: 'Cliente Due SRL — fattura 402',
    })

    // Una R3: passiva senza fattura
    await creaMovimentoBancario(venue.id, {
      importo: -500,
      causale: 'Bonifico a FORNITORE TRE SRL Causale: FT403',
      data: new Date('2026-07-12'),
    })
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 500,
      dataScadenza: new Date('2026-07-12'),
      numeroDocumento: 'FT403',
      controparteNome: 'FORNITORE TRE SRL',
      invoiceId: null,
      descrizione: 'Fornitore Tre SRL — fattura 403',
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
    expect(proposte.map((p) => p.regola)).toEqual(['R1'])
    expect(esito.contaProposte).toBe(1)

    // E il lotto si dichiara finito: nasce `in_corso` e senza questo
    // aggiornamento non ne uscirebbe mai.
    const lotto = await prisma.reconciliationBatch.findUniqueOrThrow({
      where: { id: esito.batchId },
    })
    expect(lotto.stato).toBe('completato')
    expect(lotto.regoleUsate).toEqual(['R1'])
  })

  it('un pagamento cumulativo produce una proposta con tre gambe, e le quote sommano l\'importo del movimento', async () => {
    const venue = await venueDiTest()

    await creaMovimentoBancario(venue.id, {
      importo: -500,
      causale: 'Bonifico a FORNITORE CUMULATIVO SRL saldo scadenze multiple',
      data: new Date('2026-07-20'),
    })

    const residui = [100, 150, 250]
    const scadenzeCreate = await Promise.all(
      residui.map((importoTotale) =>
        creaScadenza({
          venueId: venue.id,
          tipo: 'passiva',
          importoTotale,
          dataScadenza: new Date('2026-07-20'),
          numeroDocumento: null,
          controparteNome: 'FORNITORE CUMULATIVO SRL',
          descrizione: `Fornitore cumulativo — quota ${importoTotale}`,
        })
      )
    )

    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date('2026-07-01'),
      dateTo: new Date('2026-07-31'),
      regole: ['R1', 'R2', 'R3'],
      userId: null,
    })

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
      include: { gambe: true },
    })
    expect(proposte).toHaveLength(1)
    expect(proposte[0].gambe).toHaveLength(3)

    const scheduleIds = new Set(scadenzeCreate.map((s) => s.id))
    for (const gamba of proposte[0].gambe) {
      expect(scheduleIds.has(gamba.scheduleId!)).toBe(true)
    }

    const sommaQuote = proposte[0].gambe.reduce((totale, g) => totale + Number(g.importo), 0)
    expect(sommaQuote).toBeCloseTo(500, 2)
  })
})
