import { describe, it, expect } from 'vitest'
import { mappaMovimento, mappaMovimenti, LUNGHEZZA_MASSIMA_CAUSALE } from '../mapper'
import { rispostaMovimentiSchema, movimentoSchema } from '../types'
import contoA from './fixtures/movimenti-conto-a.json'

const primo = movimentoSchema.parse(contoA.transactions.booked[0])

describe('mappaMovimento', () => {
  it("porta bookingDate su transactionDate, che è la data usata dalla prima nota", () => {
    expect(mappaMovimento(primo).transactionDate).toEqual(new Date('2026-08-10T00:00:00.000Z'))
  })

  it('tiene valueDate separata, anche quando differisce', () => {
    const conValuta = movimentoSchema.parse(contoA.transactions.booked[2])
    const m = mappaMovimento(conValuta)
    expect(m.transactionDate).toEqual(new Date('2026-08-09T00:00:00.000Z'))
    expect(m.valueDate).toEqual(new Date('2026-08-11T00:00:00.000Z'))
  })

  it('mette valueDate a null quando la banca non la manda', () => {
    const senza = movimentoSchema.parse({ ...contoA.transactions.booked[0], valueDate: undefined })
    expect(mappaMovimento(senza).valueDate).toBeNull()
  })

  it("conserva l'importo come stringa, segno compreso", () => {
    expect(mappaMovimento(primo).amount).toBe('1250.00')
    const uscita = movimentoSchema.parse(contoA.transactions.booked[1])
    expect(mappaMovimento(uscita).amount).toBe('-0.75')
  })

  it('porta il codice proprietario della banca in bankTransactionCode', () => {
    expect(mappaMovimento(primo).bankTransactionCode).toBe('48//00')
  })

  it('usa transactionId come providerTransactionId', () => {
    expect(mappaMovimento(primo).providerTransactionId).toBe('20260810-1')
  })

  it('usa la causale come descrizione', () => {
    expect(mappaMovimento(primo).description).toContain('Bonifico a vs favore')
  })

  it("ricompone la causale dall'array quando il campo singolo manca", () => {
    const daArray = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: undefined,
      remittanceInformationUnstructuredArray: ['Prima parte', 'seconda parte'],
    })
    expect(mappaMovimento(daArray).description).toBe('Prima parte seconda parte')
  })

  it('non lascia mai la descrizione vuota: la colonna a database è NOT NULL', () => {
    const muto = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: undefined,
    })
    expect(mappaMovimento(muto).description).toBe('(movimento senza causale)')
  })

  it('tronca una causale più lunga della colonna invece di far esplodere la INSERT', () => {
    const lunga = movimentoSchema.parse({
      ...contoA.transactions.booked[0],
      remittanceInformationUnstructured: 'X'.repeat(700),
    })
    const d = mappaMovimento(lunga).description
    expect(d).toHaveLength(LUNGHEZZA_MASSIMA_CAUSALE)
    expect(d.endsWith('…')).toBe(true)
  })
})

describe('mappaMovimenti', () => {
  it('mappa contabilizzati e in sospeso insieme', () => {
    const risposta = rispostaMovimentiSchema.parse(contoA)
    expect(mappaMovimenti(risposta)).toHaveLength(6)
  })
})
