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

  it('dà metà punteggio, e lo motiva, quando il codice contraddice il metodo atteso', () => {
    // Fino al 17 agosto 2026 il disaccordo azzerava il fattore. La decisione è
    // cambiata guardando una proposta vera: il metodo scritto sulla scadenza è
    // un'intenzione presa dalla fattura, il codice della banca è un fatto già
    // accaduto, e quei dieci punti valevano il salto di un'intera fascia.
    const esito = valutaCoppia(
      movimento({ bankTransactionCode: '13//05' }),
      scadenza({ metodoPagamento: 'bonifico' }),
      { alias: new Map(), mappaCodiciBanca: mappa }
    )!
    expect(esito.fattori.codiceBanca).toBe(PESI.CODICE_BANCA / 2)
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

describe('il riferimento di una proposta cumulativa vale per tutte le sue gambe', () => {
  // Il caso vero, misurato il 16 agosto 2026 sui movimenti sincronizzati.
  // Un bonifico da 459,80 € che in causale nomina la fattura 177 riceveva DUE
  // proposte cumulative da 88 punti: una con le tre rate della 177, l'altra
  // con due rate della 177 più una della 237 — che vale lo stesso importo.
  // Entrambe prendevano i venti punti del riferimento, perché il fattore
  // guardava solo la scadenza «rappresentante» della combinazione, e il codice
  // lo dichiarava: «un'approssimazione consapevole».
  const CAUSALE_177 =
    'Bonifico tramite Internet Banking *INSTANT DEL 02/07/2026 ORE 11:55 ID. 0708400041162812486499064990IT BEN SARATOGA SNC177/2026'

  function cumulativa(documenti: Array<string | null>) {
    return valutaCoppia(
      movimento({ causale: CAUSALE_177, importo: -459.8 }),
      scadenza({ numeroDocumento: '177', residuo: 459.8, controparteNome: 'SARATOGA SNC' }),
      CONTESTO_VUOTO,
      documenti
    )
  }

  it('prende i venti punti quando la causale nomina ogni documento saldato', () => {
    expect(cumulativa(['177', '177', '177'])?.fattori.riferimento).toBeGreaterThan(0)
  })

  it('non li prende se una gamba salda un documento che la causale non nomina', () => {
    // È la proposta sbagliata: la rata della 237 vale lo stesso importo di
    // quella della 177, e senza questo controllo entrava in fascia Alta —
    // dove si approva in blocco senza aprire le schede.
    expect(cumulativa(['177', '237', '177'])?.fattori.riferimento).toBe(0)
  })

  it('lo dice, invece di limitarsi a togliere i punti', () => {
    const esito = cumulativa(['177', '237', '177'])
    expect(esito?.motivazioni.some((m) => m.segno === '-' && /non nomina/i.test(m.testo))).toBe(true)
  })

  it('senza elenco di gambe si comporta come prima', () => {
    // Le proposte a gamba singola non cambiano: sono la stragrande maggioranza.
    const esito = valutaCoppia(
      movimento({ causale: CAUSALE_177, importo: -459.8 }),
      scadenza({ numeroDocumento: '177', residuo: 459.8, controparteNome: 'SARATOGA SNC' }),
      CONTESTO_VUOTO
    )
    expect(esito?.fattori.riferimento).toBeGreaterThan(0)
  })
})

/**
 * I tre casi arrivano da una proposta vera del 17 agosto 2026, guardata a
 * schermo dall'utente: 9.897,17 € a FERRO DISTRIBUZIONE SRL, importo identico,
 * riferimento della fattura nella causale, unico abbinamento possibile — e 65
 * punti su 100, cioè fascia Media.
 *
 * Il motore aveva ragione su ogni singola regola e torto sul risultato. Le
 * regole erano scritte come se il dato in arrivo dalla banca fosse completo,
 * mentre l'estratto conto tronca le ragioni sociali e il metodo di pagamento
 * scritto in fattura è un'intenzione, non un fatto.
 */
describe('l’elasticità che i dati veri pretendono', () => {
  /** La causale vera, con «SRL» mangiato e il riferimento incollato al nome. */
  const CAUSALE_FERRO =
    'Bonifico tramite Internet Banking *INSTANT DEL 14/07/2026 ORE 09:37 ID.07084000413396844864990649 90IT BEN FERRO DISTRIBUZIONEFT 000000000006358/02'

  it('riconosce la controparte quando la banca ha troncato la forma societaria', () => {
    // In anagrafica «FERRO DISTRIBUZIONE SRL», in causale «FERRO DISTRIBUZIONEFT»:
    // il nome c'è tutto tranne la sigla, e cercarlo intero lo fa sparire.
    const esito = valutaCoppia(
      movimento({ causale: CAUSALE_FERRO, importo: -9897.17 }),
      scadenza({
        controparteNome: 'FERRO DISTRIBUZIONE SRL',
        residuo: 9897.17,
        numeroDocumento: '000000000006358/02',
      }),
      CONTESTO_VUOTO
    )

    expect(esito).not.toBeNull()
    expect(esito!.fattori.controparte).toBeGreaterThanOrEqual(16)
  })

  it('vale per le forme societarie che si incontrano davvero', () => {
    for (const [nomeAnagrafica, comeLaScriveLaBanca] of [
      ['FERRO DISTRIBUZIONE SRL', 'BEN FERRO DISTRIBUZIONE FT 1'],
      ['DISTILLERIA NARDINI S.P.A.', 'BEN DISTILLERIA NARDINI ORDINE I/72955'],
      ['SARATOGA S.N.C.', 'BEN SARATOGA 177 2026'],
      ['MA.IN.CART. S.R.L.', 'SDD MA.IN.CART. Ft.N.3300/00/2026'],
    ] as const) {
      const esito = valutaCoppia(
        movimento({ causale: comeLaScriveLaBanca }),
        scadenza({ controparteNome: nomeAnagrafica }),
        CONTESTO_VUOTO
      )
      expect(esito, nomeAnagrafica).not.toBeNull()
      expect(esito!.fattori.controparte, nomeAnagrafica).toBeGreaterThanOrEqual(12)
    }
  })

  it('non regala punti a un nome che nella causale non c’è', () => {
    // L'elasticità serve a non perdere i dati veri, non a far combaciare tutto:
    // togliendo la sigla resta un nome, e quello deve esserci.
    const esito = valutaCoppia(
      movimento({ causale: CAUSALE_FERRO }),
      scadenza({ controparteNome: 'COMMERCIALE ADRIATICA SRL' }),
      CONTESTO_VUOTO
    )
    expect(esito!.fattori.controparte).toBe(0)
  })

  it('il metodo di pagamento che non combacia non azzera il fattore', () => {
    // «Pagamento in contanti» scritto in fattura e un bonifico dello stesso
    // importo con il numero del documento: è cambiato il modo di pagare, non è
    // un'altra fattura. Il codice della banca resta un indizio, non un veto.
    const contesto: ContestoValutazione = {
      alias: new Map(),
      mappaCodiciBanca: new Map([['48', ['bonifico']]]),
    }

    const concorde = valutaCoppia(
      movimento({ bankTransactionCode: '48' }),
      scadenza({ metodoPagamento: 'bonifico' }),
      contesto
    )
    const discorde = valutaCoppia(
      movimento({ bankTransactionCode: '48' }),
      scadenza({ metodoPagamento: 'contanti' }),
      contesto
    )

    expect(concorde!.fattori.codiceBanca).toBe(PESI.CODICE_BANCA)
    // Meno di chi concorda, ma non zero: la differenza fra i due non può valere
    // il salto di un'intera fascia.
    expect(discorde!.fattori.codiceBanca).toBeGreaterThan(0)
    expect(discorde!.fattori.codiceBanca).toBeLessThan(PESI.CODICE_BANCA)
  })

  it('la proposta vera del 17 agosto arriva in fascia Alta', () => {
    // Importo identico, riferimento presente, controparte giusta, unico
    // abbinamento: era la prova che il punteggio raccontava male la realtà.
    const contesto: ContestoValutazione = {
      alias: new Map(),
      mappaCodiciBanca: new Map([['48', ['sdd']]]),
    }
    const esito = valutaCoppia(
      movimento({ causale: CAUSALE_FERRO, importo: -9897.17, bankTransactionCode: '48' }),
      scadenza({
        controparteNome: 'FERRO DISTRIBUZIONE SRL',
        residuo: 9897.17,
        numeroDocumento: '000000000006358/02',
        dataScadenza: new Date('2026-06-30'),
        metodoPagamento: 'bonifico',
      }),
      contesto
    )

    expect(esito).not.toBeNull()
    // `valutaCoppia` restituisce il parziale: il bonus di unicità lo aggiunge
    // chi conosce le alternative, e qui l'abbinamento è unico (5/5 a schermo).
    expect(fascia(esito!.punteggioParziale + PESI.UNICITA)).toBe('alta')
  })
})
