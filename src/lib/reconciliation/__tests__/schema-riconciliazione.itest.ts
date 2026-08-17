import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'

/**
 * Le tabelle del lotto esistono e i vincoli mordono.
 *
 * L'unicità su (venueId, testoNormalizzato) degli alias è quella che impedisce
 * alla memoria delle controparti di contenere due risposte diverse alla stessa
 * domanda. Prisma non sa rappresentare gli indici parziali ma questo è totale,
 * quindi vive nello schema.
 */
setupIntegrationDb()

describe('schema della riconciliazione assistita', () => {
  it('crea un lotto con una proposta e una gamba', async () => {
    const venue = await venueDiTest()
    const scadenza = await creaScadenza({ venueId: venue.id, importoTotale: 150.5 })

    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId: venue.id,
        dateFrom: new Date('2026-05-01'),
        dateTo: new Date('2026-08-31'),
        regoleUsate: ['R1', 'R2'],
        sogliaMinima: 40,
      },
    })

    expect(lotto.stato).toBe('in_corso')
    expect(lotto.contaProposte).toBe(0)
    expect(lotto.regoleUsate).toEqual(['R1', 'R2'])

    const proposta = await prisma.reconciliationProposal.create({
      data: {
        batchId: lotto.id,
        regola: 'R1',
        punteggio: 92,
        fattori: { importo: 40, riferimento: 20, controparte: 20, data: 12 },
        motivazioni: [{ testo: 'Importo e data coincidono', segno: '+' }],
        gambe: {
          create: {
            scheduleId: scadenza.id,
            importo: new Prisma.Decimal('150.50'),
          },
        },
      },
    })

    expect(proposta.stato).toBe('in_attesa')

    // Rilettura dal lotto attraverso le relazioni: la FK batch_id regge in
    // lettura, non solo in scrittura, e la gamba resta agganciata alla scadenza.
    const lottoConProposte = await prisma.reconciliationBatch.findUniqueOrThrow({
      where: { id: lotto.id },
      include: { proposte: { include: { gambe: true } } },
    })

    expect(lottoConProposte.proposte).toHaveLength(1)
    const [propostaRiletta] = lottoConProposte.proposte
    expect(propostaRiletta.id).toBe(proposta.id)
    expect(propostaRiletta.gambe).toHaveLength(1)
    expect(propostaRiletta.gambe[0].scheduleId).toBe(scadenza.id)
    // Decimal(10,2): un Float di troppo si vedrebbe qui.
    expect(Number(propostaRiletta.gambe[0].importo)).toBe(150.5)
  })

  it('rifiuta due alias con lo stesso testo nella stessa sede', async () => {
    const venue = await venueDiTest()

    await prisma.counterpartyAlias.create({
      data: {
        venueId: venue.id,
        testoNormalizzato: 'ROMA GIANFRANCO SRL',
        origine: 'manuale',
      },
    })

    await expect(
      prisma.counterpartyAlias.create({
        data: {
          venueId: venue.id,
          testoNormalizzato: 'ROMA GIANFRANCO SRL',
          origine: 'ai',
        },
      })
    ).rejects.toThrow()
  })
})
