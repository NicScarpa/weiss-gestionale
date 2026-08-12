import { describe, it, expect } from 'vitest'
import {
  movimentoSchema,
  rispostaMovimentiSchema,
  rispostaSaldiSchema,
  rispostaDettagliSchema,
} from '../types'
import contoA from './fixtures/movimenti-conto-a.json'
import contoB from './fixtures/movimenti-conto-b.json'
import dettagli from './fixtures/dettagli-conto.json'
import saldi from './fixtures/saldi-conto.json'

describe('schemi del payload GoCardless', () => {
  it('accetta i movimenti di entrambe le fixture', () => {
    expect(rispostaMovimentiSchema.parse(contoA).transactions.booked).toHaveLength(6)
    expect(rispostaMovimentiSchema.parse(contoB).transactions.booked).toHaveLength(2)
  })

  it('accetta dettagli e saldi', () => {
    expect(rispostaDettagliSchema.parse(dettagli).account.currency).toBe('EUR')
    expect(rispostaSaldiSchema.parse(saldi).balances).toHaveLength(2)
  })

  it('tratta pending come facoltativo, perché la banca non lo manda sempre', () => {
    const esito = rispostaMovimentiSchema.parse({
      transactions: { booked: [] },
    })
    expect(esito.transactions.pending).toEqual([])
  })

  // Banca della Marca non manda la controparte: lo schema la dichiara
  // facoltativa perché un'altra banca potrebbe mandarla, ma nessun codice a
  // valle può darla per presente.
  it('accetta un movimento senza controparte', () => {
    const m = movimentoSchema.parse(contoA.transactions.booked[0])
    expect(m.creditorName).toBeUndefined()
    expect(m.debtorName).toBeUndefined()
  })

  it('rifiuta un movimento senza transactionId', () => {
    const rotto = { ...contoA.transactions.booked[0], transactionId: undefined }
    expect(movimentoSchema.safeParse(rotto).success).toBe(false)
  })

  it("rifiuta un importo numerico: l'API lo manda come stringa e un float qui perderebbe centesimi", () => {
    const rotto = {
      ...contoA.transactions.booked[0],
      transactionAmount: { amount: 1250.0, currency: 'EUR' },
    }
    expect(movimentoSchema.safeParse(rotto).success).toBe(false)
  })
})
