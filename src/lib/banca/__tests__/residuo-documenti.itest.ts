import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import {
  reconcileScheduleWithEntry,
  undoScheduleReconciliation,
} from '@/lib/services/schedule-reconciliation-service'
import { reconcileVenueTransactions } from '@/lib/reconciliation/matcher'

setupIntegrationDb()

async function rigaCollegata(journalEntryId: string, importo: number) {
  const venue = await venueDiTest()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  return prisma.bankTransaction.create({
    data: {
      venueId: venue.id,
      bankAccountId: conto.id,
      transactionDate: new Date('2026-08-03'),
      description: 'Bonifico fornitore',
      amount: importo,
      importSource: 'PSD2_GOCARDLESS',
      status: 'MANUAL',
      matchedEntryId: journalEntryId,
      residuoDocumenti: 0,
    },
  })
}

async function residuoDi(id: string) {
  const r = await prisma.bankTransaction.findUniqueOrThrow({ where: { id }, select: { residuoDocumenti: true } })
  return r.residuoDocumenti === null ? null : Number(r.residuoDocumenti)
}

describe('residuoDocumenti segue le riconciliazioni della scrittura collegata', () => {
  // La riga è collegata (0 = chiusa senza documenti); una riconciliazione fatta
  // dallo scadenzario, non dalla promozione, deve comunque aggiornarla.
  it('riconciliare la scrittura con una scadenza dallo scadenzario riscrive il residuo della riga', async () => {
    const venue = await venueDiTest()
    const movimento = await creaMovimento({ uscita: 100 })
    const riga = await rigaCollegata(movimento.id, -100)
    const scadenza = await creaScadenza({ importoTotale: 60 })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId: venue.id,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')
    expect(await residuoDi(riga.id)).toBe(40)

    if (esito.outcome !== 'ok') throw new Error('impossibile')
    const annullo = await undoScheduleReconciliation({ reconciliationId: esito.reconciliationId, venueId: venue.id })
    expect(annullo.outcome).toBe('ok')
    // Tolta l'unica riconciliazione la riga resta collegata, senza documenti: 0.
    expect(await residuoDi(riga.id)).toBe(0)
  })

  it('il vecchio auto-match che aggancia una scrittura scrive il residuo della riga', async () => {
    const venue = await venueDiTest()
    const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
    // Stessa data, stesso importo, stessa descrizione: il punteggio supera la
    // soglia di auto-match e la riga viene agganciata.
    const movimento = await creaMovimento({ uscita: 250, description: 'Bonifico fornitore Rossi', date: new Date('2026-08-03') })
    const riga = await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        bankAccountId: conto.id,
        transactionDate: new Date('2026-08-03'),
        description: 'Bonifico fornitore Rossi',
        amount: -250,
        importSource: 'PSD2_GOCARDLESS',
        status: 'PENDING',
      },
    })

    await reconcileVenueTransactions(venue.id)

    const dopo = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: riga.id } })
    expect(dopo.matchedEntryId).toBe(movimento.id)
    expect(Number(dopo.residuoDocumenti)).toBe(0)
  })
})
