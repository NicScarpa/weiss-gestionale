import { describe, it, expect } from 'vitest'
import { romeDayRange } from '@/lib/timezone'
import {
  etichettaPriorita,
  formattaGiorno,
  giornoDiScadenza,
} from '@/lib/comunicazioni-format'

/**
 * La scadenza fa un giro: chi pubblica scrive un giorno, il server salva
 * l'istante in cui quel giorno finisce, la UI deve tornare a mostrare il
 * giorno scritto. Se il giro perde un giorno, "fino al 10" diventa "fino al 9"
 * e nessuno se ne accorge finché una comunicazione non sparisce troppo presto.
 */
describe('giornoDiScadenza', () => {
  it('riporta al giorno scritto una scadenza estiva (Roma UTC+2)', () => {
    const salvata = romeDayRange('2026-08-10').end.toISOString()

    expect(giornoDiScadenza(salvata)).toBe('2026-08-10')
  })

  it('riporta al giorno scritto una scadenza invernale (Roma UTC+1)', () => {
    const salvata = romeDayRange('2026-01-10').end.toISOString()

    expect(giornoDiScadenza(salvata)).toBe('2026-01-10')
  })

  it('vale anche nella notte in cui scatta l\'ora legale', () => {
    const salvata = romeDayRange('2026-03-29').end.toISOString()

    expect(giornoDiScadenza(salvata)).toBe('2026-03-29')
  })
})

describe('formattaGiorno', () => {
  it('legge una colonna data senza spostarla', () => {
    expect(formattaGiorno('2026-08-10T00:00:00.000Z')).toBe('10 agosto 2026')
  })
})

describe('etichettaPriorita', () => {
  it('traduce le priorità in italiano', () => {
    expect(etichettaPriorita('URGENT')).toBe('Urgente')
    expect(etichettaPriorita('IMPORTANT')).toBe('Importante')
    expect(etichettaPriorita('NORMAL')).toBe('Normale')
  })
})
