import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza, fornitoreDiTest } from '@/test/integration/fixtures/scadenzario'
import { POST } from '../route'

setupIntegrationDb()

/**
 * L'approvazione in blocco.
 *
 * Non introduce logica contabile: chiama per ogni proposta lo stesso
 * `approvaProposta` del singolo, così i controlli che impediscono di pagare due
 * volte restano quelli, uno per uno. Quello che questi test verificano è ciò
 * che il blocco aggiunge e che il singolo non ha: **come si comporta quando le
 * proposte del gruppo non sono tutte approvabili**.
 *
 * Il caso che conta è l'ultimo: due proposte sulla stessa riga bancaria.
 * Approvarne una supera l'altra — lo stesso denaro non salda due scadenze — e
 * in un blocco decidere *quale* vince non è un dettaglio, perché lo decide
 * l'ordine in cui il ciclo le percorre.
 */

interface RispostaBlocco {
  approvate?: number
  superate?: number
  giaDecise?: number
  rifiutate?: number
  dettagli?: Array<{ proposalId: string; esito: string; motivo?: string }>
  error?: string
}

function approvaInBlocco(proposalIds: string[]) {
  return callRoute<RispostaBlocco>(
    POST,
    jsonRequest('http://localhost/api/riconciliazione-assistita/proposte/approva-in-blocco', {
      method: 'POST',
      body: { proposalIds },
    })
  )
}

async function contoBancario(venueId: string) {
  return prisma.bankAccount.create({
    data: { venueId, name: 'Banca Della Marca', accountType: 'BANK' },
  })
}

async function rigaBanca(venueId: string, bankAccountId: string, importo: number, rif: string) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      bankAccountId,
      transactionDate: new Date('2026-08-10'),
      description: `Bonifico tramite Internet Banking *ROSSI SRL ${rif}`,
      descrizione: `ROSSI SRL ${rif}`,
      causale: 'Bonifico tramite internet banking',
      amount: -importo,
      importSource: 'PSD2_GOCARDLESS',
      status: 'PENDING',
    },
  })
}

async function lottoVuoto(venueId: string) {
  return prisma.reconciliationBatch.create({
    data: {
      venueId,
      dateFrom: new Date('2026-08-01'),
      dateTo: new Date('2026-08-31'),
      regoleUsate: ['R1'],
      contaProposte: 0,
    },
  })
}

/**
 * Una proposta pronta da approvare. Le righe si scrivono a mano invece di
 * passare da `generaLotto`: legare questi test al punteggio del motore
 * significherebbe vederli rossi al primo ritocco dei pesi.
 */
async function proposta(opzioni: {
  venueId: string
  batchId: string
  supplierId: string
  bankAccountId: string
  importo: number
  rif: string
  punteggio: number
  /** Con un movimento già esistente, la proposta gli si affianca come rivale. */
  bankTransactionId?: string
}) {
  const movimento =
    opzioni.bankTransactionId ??
    (await rigaBanca(opzioni.venueId, opzioni.bankAccountId, opzioni.importo, opzioni.rif)).id

  const scadenza = await creaScadenza({
    venueId: opzioni.venueId,
    tipo: 'passiva',
    importoTotale: opzioni.importo,
    supplierId: opzioni.supplierId,
    numeroDocumento: opzioni.rif,
    controparteNome: 'ROSSI SRL',
    dataScadenza: new Date('2026-08-09'),
  })

  const creata = await prisma.reconciliationProposal.create({
    data: {
      batchId: opzioni.batchId,
      regola: 'R1',
      punteggio: opzioni.punteggio,
      fattori: {},
      motivazioni: [],
      bankTransactionId: movimento,
      gambe: { create: [{ scheduleId: scadenza.id, importo: opzioni.importo }] },
    },
  })

  return { proposta: creata, scadenza, movimentoId: movimento }
}

async function scenario() {
  const venue = await venueDiTest()
  const fornitore = await fornitoreDiTest()
  const conto = await contoBancario(venue.id)
  const lotto = await lottoVuoto(venue.id)
  return { venue, fornitore, conto, lotto }
}

describe('POST /api/riconciliazione-assistita/proposte/approva-in-blocco', () => {
  beforeEach(() => logout())

  it('approva più proposte indipendenti e ne conta una per una', async () => {
    await entraCome('admin')
    const { venue, fornitore, conto, lotto } = await scenario()

    const a = await proposta({
      venueId: venue.id, batchId: lotto.id, supplierId: fornitore.id,
      bankAccountId: conto.id, importo: 120, rif: 'FT 12', punteggio: 92,
    })
    const b = await proposta({
      venueId: venue.id, batchId: lotto.id, supplierId: fornitore.id,
      bankAccountId: conto.id, importo: 80, rif: 'FT 13', punteggio: 88,
    })

    const r = await approvaInBlocco([a.proposta.id, b.proposta.id])

    expect(r.status).toBe(200)
    expect(r.body.approvate).toBe(2)
    expect(r.body.superate).toBe(0)

    // Due scritture vere in prima nota, una per riga bancaria.
    for (const id of [a.movimentoId, b.movimentoId]) {
      const riga = await prisma.bankTransaction.findUniqueOrThrow({ where: { id } })
      expect(riga.status).toBe('MATCHED')
      expect(riga.matchedEntryId).not.toBeNull()
    }
    // E le scadenze risultano pagate.
    for (const s of [a.scadenza, b.scadenza]) {
      const riletta = await prisma.schedule.findUniqueOrThrow({ where: { id: s.id } })
      expect(riletta.stato).toBe('pagata')
    }
  })

  it('su due proposte per la stessa riga bancaria vince quella col punteggio più alto', async () => {
    // Lo stesso denaro non può saldare due scadenze diverse. In un blocco è
    // l'ordine del ciclo a decidere quale sopravvive: percorrendo per punteggio
    // decrescente vince la più convincente, non quella arrivata per prima
    // nell'elenco.
    await entraCome('admin')
    const { venue, fornitore, conto, lotto } = await scenario()

    const debole = await proposta({
      venueId: venue.id, batchId: lotto.id, supplierId: fornitore.id,
      bankAccountId: conto.id, importo: 120, rif: 'FT 12', punteggio: 61,
    })
    const forte = await proposta({
      venueId: venue.id, batchId: lotto.id, supplierId: fornitore.id,
      bankAccountId: conto.id, importo: 120, rif: 'FT 12 bis', punteggio: 94,
      bankTransactionId: debole.movimentoId,
    })

    // Deliberatamente la debole per prima nell'elenco.
    const r = await approvaInBlocco([debole.proposta.id, forte.proposta.id])

    expect(r.status).toBe(200)
    expect(r.body.approvate).toBe(1)
    expect(r.body.superate).toBe(1)

    const vincitrice = await prisma.reconciliationProposal.findUniqueOrThrow({
      where: { id: forte.proposta.id },
    })
    const perdente = await prisma.reconciliationProposal.findUniqueOrThrow({
      where: { id: debole.proposta.id },
    })
    expect(vincitrice.stato).toBe('approvata')
    expect(perdente.stato).toBe('superata')
    // La rivale dice per mano di chi è morta.
    expect(perdente.supersededByProposalId).toBe(forte.proposta.id)

    // Nel riepilogo la perdente compare come superata, non fra le «già decise»:
    // per chi ha premuto il bottone è morta ora, non prima.
    const dettaglio = r.body.dettagli?.find((d) => d.proposalId === debole.proposta.id)
    expect(dettaglio?.esito).toBe('superata')
    expect(r.body.giaDecise).toBe(0)
  })

  it('una proposta già decisa non fa fallire il blocco: viene contata a parte', async () => {
    await entraCome('admin')
    const { venue, fornitore, conto, lotto } = await scenario()

    const viva = await proposta({
      venueId: venue.id, batchId: lotto.id, supplierId: fornitore.id,
      bankAccountId: conto.id, importo: 120, rif: 'FT 12', punteggio: 92,
    })
    const morta = await proposta({
      venueId: venue.id, batchId: lotto.id, supplierId: fornitore.id,
      bankAccountId: conto.id, importo: 80, rif: 'FT 13', punteggio: 90,
    })
    await prisma.reconciliationProposal.update({
      where: { id: morta.proposta.id },
      data: { stato: 'scartata' },
    })

    const r = await approvaInBlocco([viva.proposta.id, morta.proposta.id])

    expect(r.status).toBe(200)
    expect(r.body.approvate).toBe(1)
    expect(r.body.giaDecise).toBe(1)
    // Il riepilogo nomina la proposta che non è passata: in un blocco «una non
    // è andata» senza dire quale è inutile.
    const dettaglio = r.body.dettagli?.find((d) => d.proposalId === morta.proposta.id)
    expect(dettaglio?.esito).toBe('gia_decisa')
  })

  it('rifiuta una lista vuota', async () => {
    await entraCome('admin')
    const r = await approvaInBlocco([])
    expect(r.status).toBe(400)
  })

  it('rifiuta più di cento proposte in una volta', async () => {
    // Oltre il tetto la richiesta diventa lunga e il browser sembra piantato:
    // meglio dirlo che farlo aspettare.
    await entraCome('admin')
    const r = await approvaInBlocco(Array.from({ length: 101 }, (_, i) => `prop-${i}`))
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/100|cento/i)
  })

  it('come staff risponde 403', async () => {
    await entraCome('staff')
    const r = await approvaInBlocco(['prop-1'])
    expect(r.status).toBe(403)
  })
})
