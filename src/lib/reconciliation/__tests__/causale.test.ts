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

  it('non conta un numero a tre cifre che è sottostringa di uno più lungo', () => {
    // Il falso positivo misurato sulle 621 causali vere: 1,63% con numeri a
    // tre cifre. Qui la fattura 432 non esiste — la causale parla della 4320 —
    // e senza ancoraggio prendeva comunque venti punti, abbastanza a spingere
    // in fascia Alta la coppia col fornitore giusto e la fattura sbagliata.
    expect(contieneRiferimento(CAUSALE_INSTANT, '432')).toBe(false)
    // Ma il 4320 vero, appiccicato alla ragione sociale ("SRLFT 4320"),
    // continua a contare: l'ancoraggio delimita le cifre, non le lettere.
    expect(contieneRiferimento(CAUSALE_INSTANT, '4320')).toBe(true)
    // E la 070 dell'identificativo operazione non è la fattura 070.
    expect(contieneRiferimento(CAUSALE_INSTANT, '070')).toBe(false)
  })

  it('non conta un numero preceduto da altre cifre', () => {
    expect(contieneRiferimento('Bonifico rif 99123', '123')).toBe(false)
    expect(contieneRiferimento('Bonifico rif AB123', '123')).toBe(true)
  })

  it('trova un numero col prefisso alfabetico anche se la causale ha cifre attaccate prima', () => {
    // Il difetto simmetrico, e più costoso: `FT/2026/432` arriva tale e quale
    // da `invoice.invoiceNumber` — la forma col prefisso è ordinaria in Italia
    // — e normalizzato diventa "FT2026432". Ancorare a sinistra anche su un
    // bordo alfabetico lo faceva rifiutare ogni volta che la causale aveva una
    // cifra attaccata prima, cioè quasi sempre: venti punti persi sul fattore
    // più discriminante, e senza lasciare traccia, perché la proposta
    // semplicemente non nasce.
    const causale =
      '*INSTANT DEL 10/08/2026 ORE 17:53 FT/2026/432 ROSSI SRL Causale: FT/2026/432'
    expect(contieneRiferimento(causale, 'FT/2026/432')).toBe(true)
    // Il prefisso alfabetico non annulla l'ancoraggio dell'altro lato: la
    // fattura 43 non si trova dentro FT2026432.
    expect(contieneRiferimento(causale, 'FT/2026/43')).toBe(false)
  })

  it('e il falso positivo a tre cifre resta escluso', () => {
    // Il guadagno del punto 8 non si perde: i numeri a tre cifre sono numerici
    // per definizione, quindi restano delimitati da entrambi i lati.
    // "432" vive dentro "07084324084", circondato da cifre da entrambi i lati
    expect(contieneRiferimento('Bonifico ID 07084324084 ROSSI SRL', '432')).toBe(false)
    expect(contieneRiferimento(CAUSALE_INSTANT, '432')).toBe(false)
  })

  // I casi che seguono vengono dalle proposte vere generate il 16 agosto 2026
  // sui movimenti sincronizzati dalla banca. Sette proposte perdevano i venti
  // punti del riferimento pur avendolo in causale, e sei di esse restavano
  // sotto la soglia della fascia Alta — quella che si approva in blocco.
  describe('il numero c\'è, ma la normalizzazione gli incolla accanto un altro campo', () => {
    it('la data che segue il numero non deve nasconderlo', () => {
      // `Ft.N.3300/00/2026 30/05/2026` normalizzato è `FTN330000202630052026`:
      // la data si salda al numero e la guardia scambia quella cucitura per
      // contiguità. Nell'originale fra i due c'è uno spazio.
      const causale =
        'SDD Core - Richiesta Incasso SEPA Ft.N.3300/00/2026 30/05/2026 MA.IN.CART. S.R.L. IT59g070846499000000075'
      expect(contieneRiferimento(causale, '3300/00/2026')).toBe(true)
    })

    it('vale per tutte e tre le fatture dello stesso fornitore', () => {
      const giugno =
        'SDD Core - Richiesta Incasso SEPA Ft.N.4450/00/2026 30/06/2026 MA.IN.CART. S.R.L. IT59g070846499000000075'
      expect(contieneRiferimento(giugno, '4450/00/2026')).toBe(true)
      expect(
        contieneRiferimento(giugno.replace('4450/00/2026', '4451/00/2026'), '4451/00/2026')
      ).toBe(true)
    })

    it('l\'anno che segue un numero corto non deve nasconderlo', () => {
      // `SARATOGA SNC 177 2026` → `SARATOGASNC1772026`: il 2026 si incolla al
      // 177, che è il numero vero della fattura.
      const causale = 'Bonifico tramite Internet Banking BEN SARATOGA SNC 177 2026'
      expect(contieneRiferimento(causale, '177')).toBe(true)
    })

    it('cerca oltre la prima occorrenza', () => {
      // La prima può essere quella dentro l'identificativo operazione, dove la
      // guardia giustamente blocca: fermarsi lì perderebbe quella buona più
      // avanti nella causale.
      const causale = 'Bonifico ID 07084324084 ROSSI SRL Causale: fattura 432 del mese'
      expect(contieneRiferimento(causale, '432')).toBe(true)
    })
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
