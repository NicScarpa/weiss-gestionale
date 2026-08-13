import { describe, it, expect } from 'vitest'
import {
  valutaCoppia,
  fascia,
  PESI,
  SOGLIE,
  type MovimentoBanca,
  type ScadenzaCandidata,
  type ContestoValutazione,
} from '../punteggio'

const CONTESTO_VUOTO: ContestoValutazione = {
  alias: new Map(),
  mappaCodiciBanca: new Map(),
}

function movimento(over: Partial<MovimentoBanca> = {}): MovimentoBanca {
  return {
    id: 'btx-1',
    data: new Date('2026-07-07'),
    causale: 'BEN ROMA GIANFRANCO SRLFT 4320 Causale: FT 4320',
    importo: -846.95, // negativo = uscita
    bankTransactionCode: null,
    ...over,
  }
}

function scadenza(over: Partial<ScadenzaCandidata> = {}): ScadenzaCandidata {
  return {
    id: 'sch-1',
    tipo: 'passiva',
    dataScadenza: new Date('2026-07-07'),
    descrizione: 'Roma Gianfranco SRL — fattura 4320',
    residuo: 846.95,
    numeroDocumento: '4320',
    controparteNome: 'ROMA GIANFRANCO SRL',
    controparteIban: null,
    supplierId: 'sup-1',
    partitaIvaControparte: null,
    metodoPagamento: null,
    ...over,
  }
}

describe('il segno è un filtro, non un fattore', () => {
  it('un\'uscita non produce proposta su una scadenza attiva', () => {
    const esito = valutaCoppia(movimento(), scadenza({ tipo: 'attiva' }), CONTESTO_VUOTO)
    expect(esito).toBeNull()
  })

  it('un\'entrata non produce proposta su una scadenza passiva', () => {
    const esito = valutaCoppia(
      movimento({ importo: 846.95 }),
      scadenza({ tipo: 'passiva' }),
      CONTESTO_VUOTO
    )
    expect(esito).toBeNull()
  })

  it('una scadenza senza residuo non produce proposta', () => {
    const esito = valutaCoppia(movimento(), scadenza({ residuo: 0 }), CONTESTO_VUOTO)
    expect(esito).toBeNull()
  })
})

describe('il fattore importo', () => {
  it('dà il massimo quando l\'importo coincide col residuo', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.importo).toBe(PESI.IMPORTO)
  })

  it('dà meno per un acconto, in proporzione a quanto copre', () => {
    const esito = valutaCoppia(
      movimento({ importo: -400 }),
      scadenza({ residuo: 800 }),
      CONTESTO_VUOTO
    )!
    // metà del residuo → metà dei 15 punti dell'acconto
    expect(esito.fattori.importo).toBe(8)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /[Aa]cconto/.test(m.testo))).toBe(true)
  })

  it('non dà nulla quando il movimento eccede il residuo, e lo dice', () => {
    const esito = valutaCoppia(
      movimento({ importo: -2000 }),
      scadenza({ residuo: 800 }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.importo).toBe(0)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /eccede/.test(m.testo))).toBe(true)
  })
})

describe('il fattore data è asimmetrico', () => {
  it('dà il massimo il giorno della scadenza', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.data).toBe(PESI.DATA)
  })

  it('penalizza poco il ritardo, che è normale', () => {
    const esito = valutaCoppia(
      movimento({ data: new Date('2026-07-10') }),
      scadenza({ dataScadenza: new Date('2026-07-07') }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.data).toBe(13)
  })

  it('penalizza di più l\'anticipo, che è raro, e lo dice', () => {
    const esito = valutaCoppia(
      movimento({ data: new Date('2026-07-04') }),
      scadenza({ dataScadenza: new Date('2026-07-07') }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.data).toBe(8)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /prima della scadenza/.test(m.testo))).toBe(
      true
    )
  })

  it('un pagamento di giugno non guadagna nulla su una rata di agosto', () => {
    const esito = valutaCoppia(
      movimento({ data: new Date('2026-06-26') }),
      scadenza({ dataScadenza: new Date('2026-08-10') }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.data).toBe(0)
  })
})

describe('il fattore riferimento documento', () => {
  it('dà il massimo quando il numero è nella causale, anche appiccicato', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.riferimento).toBe(PESI.RIFERIMENTO)
  })

  it('non dà nulla quando la scadenza non ha numero documento', () => {
    const esito = valutaCoppia(movimento(), scadenza({ numeroDocumento: null }), CONTESTO_VUOTO)!
    expect(esito.fattori.riferimento).toBe(0)
  })
})

describe('il fattore controparte', () => {
  it('dà il massimo quando un alias appreso indica il fornitore', () => {
    const contesto: ContestoValutazione = {
      alias: new Map([['BEN ROMA GIANFRANCO SRLFT 4320 CAUSALE FT 4320', 'sup-1']]),
      mappaCodiciBanca: new Map(),
    }
    const esito = valutaCoppia(
      movimento(),
      scadenza({ controparteNome: 'NOME COMPLETAMENTE DIVERSO' }),
      contesto
    )!
    expect(esito.fattori.controparte).toBe(PESI.CONTROPARTE)
  })

  it('riconosce l\'IBAN quando compare nella causale', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Iban beneficiario: IT78S07084612000000000900667' }),
      scadenza({ controparteNome: null, controparteIban: 'IT78S07084612000000000900667' }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(18)
  })

  it('riconosce la partita IVA quando compare nella causale', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Partita Iva ordinante: 01723900930' }),
      scadenza({ controparteNome: null, partitaIvaControparte: '01723900930' }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(18)
  })

  it('la ragione sociale per intero nella causale vale quanto un IBAN', () => {
    // "ROMA GIANFRANCO SRL" (19 caratteri) compare dentro "…SRLFT 4320":
    // una ragione sociale così lunga non ci finisce per caso
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.controparte).toBe(18)
  })

  it('un nome corto vale meno, perché la coincidenza è plausibile', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Bonifico ACME per fornitura' }),
      scadenza({ controparteNome: 'ACME', numeroDocumento: null }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(12)
  })

  it('non dà nulla quando non riconosce nessuno', () => {
    const esito = valutaCoppia(
      movimento({ causale: 'Addebito commissioni trimestrali' }),
      scadenza({ controparteNome: 'ROMA GIANFRANCO SRL', numeroDocumento: null }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.controparte).toBe(0)
  })

  it('l\'alias appreso vince sull\'IBAN, perché una correzione confermata pesa più di un indizio dedotto', () => {
    const contesto: ContestoValutazione = {
      alias: new Map([['BEN ROMA GIANFRANCO SRLFT 4320 CAUSALE FT 4320', 'sup-1']]),
      mappaCodiciBanca: new Map(),
    }
    const esito = valutaCoppia(
      movimento({
        causale: 'BEN ROMA GIANFRANCO SRLFT 4320 Causale: FT 4320 IBAN IT78S07084612000000000900667',
      }),
      scadenza({ controparteIban: 'IT78S07084612000000000900667' }),
      contesto
    )!
    expect(esito.fattori.controparte).toBe(PESI.CONTROPARTE)
  })

  it('l\'IBAN vince sul nome quando valgono lo stesso punteggio: lo si vede dalla motivazione', () => {
    const esito = valutaCoppia(
      movimento({
        causale: 'BEN ROMA GIANFRANCO SRLFT 4320 Causale: FT 4320 IBAN IT78S07084612000000000900667',
      }),
      scadenza({ controparteIban: 'IT78S07084612000000000900667' }),
      CONTESTO_VUOTO
    )!
    expect(
      esito.motivazioni.some((m) => m.testo === 'IBAN della controparte presente nella causale')
    ).toBe(true)
    expect(
      esito.motivazioni.some((m) => m.testo === 'Nome della controparte presente nella causale')
    ).toBe(false)
  })
})

describe('il fattore codice banca', () => {
  const mappa = new Map([['13//05', ['sdd']]])

  it('dà il massimo quando il codice concorda col metodo atteso', () => {
    const esito = valutaCoppia(
      movimento({ bankTransactionCode: '13//05' }),
      scadenza({ metodoPagamento: 'sdd' }),
      { alias: new Map(), mappaCodiciBanca: mappa }
    )!
    expect(esito.fattori.codiceBanca).toBe(PESI.CODICE_BANCA)
  })

  it('non dà nulla e lo motiva quando il codice contraddice il metodo atteso', () => {
    const esito = valutaCoppia(
      movimento({ bankTransactionCode: '13//05' }),
      scadenza({ metodoPagamento: 'bonifico' }),
      { alias: new Map(), mappaCodiciBanca: mappa }
    )!
    expect(esito.fattori.codiceBanca).toBe(0)
    expect(esito.motivazioni.some((m) => m.segno === '-' && /codice/i.test(m.testo))).toBe(true)
  })

  it('non dà nulla e non si lamenta quando la mappa è vuota', () => {
    // È lo stato iniziale: la mappa va ricavata dai 678 movimenti veri
    const esito = valutaCoppia(
      movimento({ bankTransactionCode: '13//05' }),
      scadenza({ metodoPagamento: 'bonifico' }),
      CONTESTO_VUOTO
    )!
    expect(esito.fattori.codiceBanca).toBe(0)
    expect(esito.motivazioni.every((m) => !/codice/i.test(m.testo))).toBe(true)
  })
})

describe('il totale e le fasce', () => {
  it('la coppia perfetta arriva a 83 senza contare l\'unicità', () => {
    // 30 importo + 20 riferimento + 18 controparte + 15 data + 0 codice banca.
    // Con l'unicità (unico candidato, +5) fa 88: fascia Alta. È il collaudo
    // della taratura — se la coppia più evidente possibile non arrivasse in
    // Alta, "Approva tutte le sicure" non avrebbe mai nulla da approvare, che
    // è il difetto di CashKing che la spec vieta di copiare.
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.punteggioParziale).toBe(83)
    expect(esito.fattori.unicita).toBe(0)
  })

  it('nessun fattore supera il suo massimo', () => {
    const esito = valutaCoppia(movimento(), scadenza(), CONTESTO_VUOTO)!
    expect(esito.fattori.importo).toBeLessThanOrEqual(PESI.IMPORTO)
    expect(esito.fattori.riferimento).toBeLessThanOrEqual(PESI.RIFERIMENTO)
    expect(esito.fattori.controparte).toBeLessThanOrEqual(PESI.CONTROPARTE)
    expect(esito.fattori.data).toBeLessThanOrEqual(PESI.DATA)
    expect(esito.fattori.codiceBanca).toBeLessThanOrEqual(PESI.CODICE_BANCA)
  })

  it('i pesi sommano esattamente a 100', () => {
    const somma =
      PESI.IMPORTO + PESI.RIFERIMENTO + PESI.CONTROPARTE + PESI.DATA + PESI.CODICE_BANCA + PESI.UNICITA
    expect(somma).toBe(100)
  })

  it('le fasce coprono l\'intervallo senza buchi né sovrapposizioni', () => {
    expect(fascia(100)).toBe('alta')
    expect(fascia(SOGLIE.ALTA)).toBe('alta')
    expect(fascia(SOGLIE.ALTA - 1)).toBe('media')
    expect(fascia(SOGLIE.MEDIA)).toBe('media')
    expect(fascia(SOGLIE.MEDIA - 1)).toBe('bassa')
    expect(fascia(SOGLIE.MINIMA)).toBe('bassa')
  })
})
