import { describe, it, expect } from 'vitest'
import {
  normalizzaTesto,
  contieneRiferimento,
  estraiRiferimentiDocumento,
  estraiPartiteIva,
} from '../causale'

/**
 * I casi vengono da causali autentiche di Banca Della Marca, scaricate nella
 * Fase 0 dell'open banking. Non inventare stringhe: la forma di queste causali
 * è l'unica cosa che il motore ha da leggere, perché il campo controparte
 * arriva vuoto.
 */
const CAUSALE_INSTANT =
  '*INSTANT DEL 07/07/2026 ORE 12:19 ID. 07084000412224084864990649901T BEN ROMA ' +
  'GIANFRANCO SRLFT 4320 Info aggiuntive: Codice Riferimento Operazione: ' +
  '07084000412224084864990649901T Iban beneficiario: IT78S07084612000000000900667 ' +
  'Nominativo beneficiario: ROMA GIANFRANCO SRL Codice causale: 26 ' +
  'Data contabile: 07/07/2026 Causale: FT 4320 Esito: Eseguita Importo: -846.95 ' +
  'Codice Fiscale/Partita Iva ordinante: 01723900930'

describe('normalizzaTesto', () => {
  it('porta a maiuscolo, toglie la punteggiatura e comprime gli spazi', () => {
    expect(normalizzaTesto('  Roma  Gianfranco S.r.l. ')).toBe('ROMA GIANFRANCO SRL')
  })

  it('toglie gli accenti, perché le causali della banca li perdono già', () => {
    // Nelle causali osservate "Località" arriva come "Localit?"
    expect(normalizzaTesto('Società Cooperativa')).toBe('SOCIETA COOPERATIVA')
  })

  it('collassa le sigle societarie, che la banca scrive senza punti', () => {
    expect(normalizzaTesto('Bar S.p.A.')).toBe('BAR SPA')
    expect(normalizzaTesto('Alfa S.n.c.')).toBe('ALFA SNC')
  })

  it('ma gli altri segni separano le parole invece di sparire', () => {
    // Cancellare tutta la punteggiatura darebbe PAGAMENTOFATTURA, che non
    // troverebbe mai "Pagamento fattura" scritto nell'anagrafica
    expect(normalizzaTesto('PAGAMENTO-FATTURA')).toBe('PAGAMENTO FATTURA')
    expect(normalizzaTesto('ACME,SPA')).toBe('ACME SPA')
  })

  it('sulla stringa vuota torna la stringa vuota', () => {
    expect(normalizzaTesto('')).toBe('')
  })
})

describe('contieneRiferimento', () => {
  it('trova il numero fattura anche quando è appiccicato alla ragione sociale', () => {
    expect(contieneRiferimento(CAUSALE_INSTANT, '4320')).toBe(true)
  })

  it('trova un numero scritto con la barra ignorando la punteggiatura', () => {
    expect(contieneRiferimento('Pagamento fatt. 2026/123', '2026/123')).toBe(true)
  })

  it('rifiuta i riferimenti troppo corti, che troverebbero qualunque cosa', () => {
    // "12" comparirebbe dentro l'ID operazione di ogni bonifico
    expect(contieneRiferimento(CAUSALE_INSTANT, '12')).toBe(false)
  })

  it('non trova un numero che non c\'è', () => {
    expect(contieneRiferimento(CAUSALE_INSTANT, '9999')).toBe(false)
  })
})

describe('estraiRiferimentiDocumento', () => {
  it('estrae il numero preceduto da FT anche senza spazio prima', () => {
    expect(estraiRiferimentiDocumento(CAUSALE_INSTANT)).toContain('4320')
  })

  it('estrae il numero preceduto da FATTURA', () => {
    expect(estraiRiferimentiDocumento('Saldo FATTURA N. 2026/45')).toContain('2026/45')
  })

  it('non ripete lo stesso riferimento due volte', () => {
    // CAUSALE_INSTANT contiene "SRLFT 4320" e "Causale: FT 4320"
    const trovati = estraiRiferimentiDocumento(CAUSALE_INSTANT)
    expect(trovati.filter((r) => r === '4320')).toHaveLength(1)
  })
})

describe('estraiPartiteIva', () => {
  it('estrae la partita IVA dell\'ordinante', () => {
    expect(estraiPartiteIva(CAUSALE_INSTANT)).toContain('01723900930')
  })

  it('non scambia per partita IVA l\'ID operazione, che è più lungo', () => {
    expect(estraiPartiteIva(CAUSALE_INSTANT)).not.toContain('07084000412224084864990649901')
  })
})
