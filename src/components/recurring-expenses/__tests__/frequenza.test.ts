import { describe, it, expect } from 'vitest'
import {
  campoRichiesto,
  descriviRicorrenza,
  quotaAnnuale,
  quotaMensile,
} from '../frequenza'

describe('quotaMensile', () => {
  it('una spesa mensile pesa il suo importo', () => {
    expect(quotaMensile({ amount: 1200, frequency: 'MONTHLY' })).toBe(1200)
  })

  it('una spesa annuale si spalma su dodici mesi', () => {
    expect(quotaMensile({ amount: 1200, frequency: 'YEARLY' })).toBe(100)
  })

  it('una spesa trimestrale pesa un terzo al mese', () => {
    expect(quotaMensile({ amount: 900, frequency: 'QUARTERLY' })).toBe(300)
  })

  it('accetta anche gli importi che Prisma restituisce come stringa', () => {
    expect(quotaMensile({ amount: '450.50', frequency: 'MONTHLY' })).toBe(450.5)
  })
})

describe('quotaAnnuale', () => {
  it('una spesa mensile vale dodici volte', () => {
    expect(quotaAnnuale({ amount: 100, frequency: 'MONTHLY' })).toBe(1200)
  })

  it('una spesa settimanale vale cinquantadue volte', () => {
    expect(quotaAnnuale({ amount: 10, frequency: 'WEEKLY' })).toBe(520)
  })
})

describe('descriviRicorrenza', () => {
  it('nomina il giorno della settimana', () => {
    expect(descriviRicorrenza({ frequency: 'WEEKLY', dayOfWeek: 1, dayOfMonth: null })).toBe(
      'ogni lunedì'
    )
  })

  it('nomina il giorno del mese', () => {
    expect(descriviRicorrenza({ frequency: 'MONTHLY', dayOfMonth: 15, dayOfWeek: null })).toBe(
      'ogni mese il 15'
    )
  })

  it('regge una ricorrenza a cui manca il giorno', () => {
    expect(descriviRicorrenza({ frequency: 'MONTHLY', dayOfMonth: null, dayOfWeek: null })).toBe(
      'ogni mese'
    )
  })

  it('non lascia mai la descrizione vuota', () => {
    for (const frequency of ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const) {
      expect(descriviRicorrenza({ frequency, dayOfMonth: null, dayOfWeek: null })).not.toBe('')
    }
  })
})

describe('campoRichiesto', () => {
  it('la frequenza settimanale chiede il giorno della settimana', () => {
    expect(campoRichiesto('WEEKLY')).toBe('dayOfWeek')
  })

  it('la frequenza mensile chiede il giorno del mese', () => {
    expect(campoRichiesto('MONTHLY')).toBe('dayOfMonth')
  })

  it('la frequenza giornaliera non chiede nulla', () => {
    expect(campoRichiesto('DAILY')).toBeNull()
  })
})
