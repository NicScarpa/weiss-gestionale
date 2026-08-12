import { describe, it, expect } from 'vitest'
import {
  calculateScheduleMatchScore,
  SCHEDULE_MATCH_THRESHOLDS,
  type MatchableEntry,
  type MatchableSchedule,
} from '../schedule-matcher'

/**
 * Il punteggio decide quali movimenti vengono proposti per saldare una
 * scadenza. Sui dati reali di Sibill l'importo coincide al centesimo in tutti
 * i match automatici osservati, mentre la controparte diverge spesso: i pesi
 * riflettono questa evidenza.
 */

function movimento(over: Partial<MatchableEntry> = {}): MatchableEntry {
  return {
    id: 'entry-1',
    date: new Date('2026-09-30'),
    description: 'Bonifico a Fornitore Bevande SRL',
    debitAmount: null,
    creditAmount: 1000,
    documentRef: null,
    counterpartName: 'Fornitore Bevande SRL',
    ...over,
  }
}

function scadenza(over: Partial<MatchableSchedule> = {}): MatchableSchedule {
  return {
    id: 'sched-1',
    tipo: 'passiva',
    dataScadenza: new Date('2026-09-30'),
    descrizione: 'Fornitore Bevande SRL — fattura 2026/123',
    importoTotale: 1000,
    importoPagato: 0,
    numeroDocumento: '2026/123',
    controparteNome: 'Fornitore Bevande SRL',
    ...over,
  }
}

describe('calculateScheduleMatchScore', () => {
  it('dà punteggio pieno a importo e data coincidenti', () => {
    const esito = calculateScheduleMatchScore(movimento(), scadenza())
    expect(esito.score).toBeGreaterThanOrEqual(0.9)
  })

  it('non propone un movimento nel verso sbagliato', () => {
    // Un incasso non può saldare una scadenza passiva
    const incasso = movimento({ debitAmount: 1000, creditAmount: null })
    expect(calculateScheduleMatchScore(incasso, scadenza()).score).toBe(0)
  })

  it('salda una scadenza attiva con un incasso, non con un\'uscita', () => {
    const attiva = scadenza({ tipo: 'attiva' })
    const incasso = movimento({ debitAmount: 1000, creditAmount: null })
    const uscita = movimento()

    expect(calculateScheduleMatchScore(incasso, attiva).score).toBeGreaterThan(0.8)
    expect(calculateScheduleMatchScore(uscita, attiva).score).toBe(0)
  })

  it('ignora le scadenze già saldate', () => {
    const saldata = scadenza({ importoPagato: 1000 })
    expect(calculateScheduleMatchScore(movimento(), saldata).score).toBe(0)
  })

  it('confronta il movimento col residuo, non col totale', () => {
    // Scadenza da 1000 con 600 già pagati: un movimento da 400 la chiude
    const parziale = scadenza({ importoPagato: 600 })
    const saldo = movimento({ creditAmount: 400 })

    expect(calculateScheduleMatchScore(saldo, parziale).score).toBeGreaterThanOrEqual(0.9)
  })

  it('considera plausibile un acconto, ma meno di un saldo esatto', () => {
    const acconto = movimento({ creditAmount: 500 })
    const saldo = movimento({ creditAmount: 1000 })

    const scoreAcconto = calculateScheduleMatchScore(acconto, scadenza()).score
    const scoreSaldo = calculateScheduleMatchScore(saldo, scadenza()).score

    expect(scoreAcconto).toBeGreaterThan(0)
    expect(scoreAcconto).toBeLessThan(scoreSaldo)
  })

  it('tollera i ritardi di pagamento senza scartare il match', () => {
    // Un pagamento a 20 giorni dalla scadenza resta proponibile
    const tardivo = movimento({ date: new Date('2026-10-20') })
    const score = calculateScheduleMatchScore(tardivo, scadenza()).score

    expect(score).toBeGreaterThanOrEqual(SCHEDULE_MATCH_THRESHOLDS.MINIMUM)
  })

  it('penalizza i movimenti troppo lontani nel tempo', () => {
    const puntuale = calculateScheduleMatchScore(movimento(), scadenza()).score
    const lontano = calculateScheduleMatchScore(
      movimento({ date: new Date('2026-12-15') }),
      scadenza()
    ).score

    expect(lontano).toBeLessThan(puntuale)
  })

  it('riconosce il numero documento nella causale', () => {
    const conRiferimento = movimento({ description: 'Bonifico fatt 2026/123' })
    const senzaRiferimento = movimento({ description: 'Bonifico' })

    expect(calculateScheduleMatchScore(conRiferimento, scadenza()).score).toBeGreaterThan(
      calculateScheduleMatchScore(senzaRiferimento, scadenza()).score
    )
  })

  it('propone il match anche quando la controparte non coincide', () => {
    // Caso reale osservato in Sibill: un bonifico a "ESTENERGY" salda una
    // fattura "HERA". L'importo esatto vale più del nome.
    const altroNome = movimento({
      description: 'Bonifico ESTENERGY SPA',
      counterpartName: 'ESTENERGY SPA',
    })
    const bolletta = scadenza({
      descrizione: 'HERA SPA — fattura utenze',
      controparteNome: 'HERA SPA',
      numeroDocumento: null,
    })

    expect(calculateScheduleMatchScore(altroNome, bolletta).score).toBeGreaterThanOrEqual(
      SCHEDULE_MATCH_THRESHOLDS.MINIMUM
    )
  })

  it('non supera mai il punteggio massimo', () => {
    const perfetto = movimento({ description: 'Pagamento fattura 2026/123' })
    expect(calculateScheduleMatchScore(perfetto, scadenza()).score).toBeLessThanOrEqual(1)
  })
})

describe('motivazioni del punteggio', () => {
  const scadenza = {
    id: 's1',
    tipo: 'passiva',
    dataScadenza: new Date('2026-09-10'),
    descrizione: 'Affitto settembre',
    importoTotale: 800,
    importoPagato: 0,
    numeroDocumento: 'FT-2026-0042',
    controparteNome: 'Immobiliare Rossi',
  }

  it('nomina l importo identico e la stessa data', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm1',
        date: new Date('2026-09-10'),
        description: 'Bonifico affitto',
        debitAmount: null,
        creditAmount: 800,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.motivazioni).toContain('Importo identico')
    expect(esito.motivazioni).toContain('Stessa data')
  })

  it('nomina il numero documento quando compare nella causale', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm2',
        date: new Date('2026-09-10'),
        description: 'Pagamento FT 2026 0042',
        debitAmount: null,
        creditAmount: 800,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.motivazioni).toContain('Numero documento nella causale')
  })

  it('nomina l acconto quando il movimento copre solo una parte', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm3',
        date: new Date('2026-09-10'),
        description: 'Acconto',
        debitAmount: null,
        creditAmount: 300,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.motivazioni).toContain('Acconto parziale')
  })

  it('non emette motivazioni quando il punteggio è zero', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm4',
        date: new Date('2026-09-10'),
        description: 'Incasso',
        debitAmount: 800,
        creditAmount: null,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.score).toBe(0)
    expect(esito.motivazioni).toEqual([])
  })
})
