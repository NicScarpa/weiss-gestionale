import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { DELETE as DELETE_movimento } from '@/app/api/prima-nota/[id]/route'
import { POST as POST_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/route'

/**
 * Cancellazione dei movimenti di prima nota.
 *
 * Il blocco esisteva solo per i movimenti generati da una chiusura di cassa.
 * Un movimento riconciliato si poteva cancellare: la scadenza restava "pagata"
 * verso qualcosa che non esiste più, e il debito spariva dal previsionale senza
 * che fosse uscito un euro.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

function cancella(journalEntryId: string) {
  return callRoute<{ error?: string }>(
    DELETE_movimento,
    jsonRequest(`/api/prima-nota/${journalEntryId}`, { method: 'DELETE' }),
    { id: journalEntryId }
  )
}

describe('cancellazione dei movimenti agganciati', () => {
  it('un movimento riconciliato con una scadenza non si cancella: 409', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const movimento = await creaMovimento({ uscita: 100 })

    await callRoute(
      POST_riconciliazione,
      jsonRequest(`/api/scadenzario/${scadenza.id}/riconciliazioni`, {
        method: 'POST',
        body: { journalEntryId: movimento.id },
      }),
      { id: scadenza.id }
    )

    const esito = await cancella(movimento.id)

    expect(esito.status).toBe(409)
    expect(esito.body.error).toMatch(/riconcilia/i)

    const dopo = await prisma.journalEntry.findUnique({ where: { id: movimento.id } })
    expect(dopo?.deletedAt).toBeNull()
  })

  it('un movimento con una transazione bancaria collegata non si cancella: 409', async () => {
    const venue = await prisma.venue.findFirstOrThrow({ where: { isActive: true } })
    const movimento = await creaMovimento({ uscita: 100, venueId: venue.id })
    await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        transactionDate: new Date('2026-08-03'),
        description: 'Bonifico',
        amount: -100,
        matchedEntryId: movimento.id,
        status: 'MATCHED',
      },
    })

    const esito = await cancella(movimento.id)

    expect(esito.status).toBe(409)
    expect(esito.body.error).toMatch(/bancaria/i)
  })

  it('un movimento libero resta cancellabile', async () => {
    const movimento = await creaMovimento({ uscita: 100 })

    const esito = await cancella(movimento.id)

    expect(esito.status).toBe(200)
    const dopo = await prisma.journalEntry.findUnique({ where: { id: movimento.id } })
    expect(dopo?.deletedAt).not.toBeNull()
  })

  it('sganciata la riconciliazione, il movimento torna cancellabile', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const movimento = await creaMovimento({ uscita: 100 })

    const riconciliazione = await callRoute<{ id: string }>(
      POST_riconciliazione,
      jsonRequest(`/api/scadenzario/${scadenza.id}/riconciliazioni`, {
        method: 'POST',
        body: { journalEntryId: movimento.id },
      }),
      { id: scadenza.id }
    )

    const { DELETE: DELETE_riconciliazione } = await import(
      '@/app/api/scadenzario/[id]/riconciliazioni/[reconciliationId]/route'
    )
    await callRoute(
      DELETE_riconciliazione,
      jsonRequest(
        `/api/scadenzario/${scadenza.id}/riconciliazioni/${riconciliazione.body.id}`,
        { method: 'DELETE' }
      ),
      { id: scadenza.id, reconciliationId: riconciliazione.body.id }
    )

    expect((await cancella(movimento.id)).status).toBe(200)
  })
})
