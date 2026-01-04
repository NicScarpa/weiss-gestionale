/**
 * Type definitions for FatturaPA XML (Italian Electronic Invoice)
 * Basato sulla specifica FatturaPA v1.2.1
 */

// Dati Anagrafici Fornitore
export interface CedentePrestatore {
  denominazione: string
  partitaIva: string
  codiceFiscale?: string
  sede: {
    indirizzo: string
    cap: string
    comune: string
    provincia?: string
    nazione: string
  }
}

// Dati Anagrafici Cliente (Cessionario/Committente)
export interface CessionarioCommittente {
  denominazione: string
  partitaIva?: string
  codiceFiscale?: string
  sede: {
    indirizzo: string
    cap: string
    comune: string
    provincia?: string
    nazione: string
  }
}

// Linea dettaglio fattura
export interface DettaglioLinea {
  numeroLinea: number
  descrizione: string
  quantita?: number
  unitaMisura?: string
  prezzoUnitario: number
  prezzoTotale: number
  aliquotaIVA: number
}

// Riepilogo IVA
export interface DatiRiepilogo {
  aliquotaIVA: number
  imponibileImporto: number
  imposta: number
  natura?: string // Natura operazione per aliquota 0% (es. N1, N2, N3...)
}

// Dati Pagamento
export interface DatiPagamento {
  condizioniPagamento: string // TP01=a rate, TP02=completo, TP03=anticipo
  dettagliPagamento: DettaglioPagamento[]
}

export interface DettaglioPagamento {
  modalitaPagamento: string // MP01=Contanti, MP05=Bonifico, MP08=Carta, etc.
  dataScadenzaPagamento?: string // YYYY-MM-DD
  importoPagamento: number
  istitutoFinanziario?: string
  iban?: string
}

// Fattura parsata
export interface FatturaParsata {
  // Header
  progressivoInvio: string
  formatoTrasmissione: string
  codiceDestinatario?: string
  pecDestinatario?: string

  // Cedente/Prestatore (Fornitore)
  cedentePrestatore: CedentePrestatore

  // Cessionario/Committente (Cliente - la nostra azienda)
  cessionarioCommittente: CessionarioCommittente

  // Dati Generali Documento
  tipoDocumento: string // TD01=Fattura, TD04=Nota di credito, etc.
  divisa: string // EUR
  data: string // YYYY-MM-DD
  numero: string
  causale?: string[]

  // Importi
  importoTotaleDocumento: number
  arrotondamento?: number

  // Dettaglio linee
  dettaglioLinee: DettaglioLinea[]

  // Riepilogo IVA
  datiRiepilogo: DatiRiepilogo[]

  // Pagamento
  datiPagamento?: DatiPagamento

  // Metadati parsing
  xmlOriginale?: string
  nomeFile?: string
}

// Tipo documento FatturaPA
export const TIPI_DOCUMENTO: Record<string, string> = {
  TD01: 'Fattura',
  TD02: 'Acconto/Anticipo su fattura',
  TD03: 'Acconto/Anticipo su parcella',
  TD04: 'Nota di Credito',
  TD05: 'Nota di Debito',
  TD06: 'Parcella',
  TD16: 'Integrazione fattura reverse charge interno',
  TD17: 'Integrazione/autofattura per acquisto servizi estero',
  TD18: 'Integrazione per acquisto beni intracomunitari',
  TD19: 'Integrazione/autofattura per acquisto beni art.17 c.2 DPR 633/72',
  TD20: 'Autofattura per regolarizzazione e integrazione delle fatture',
  TD21: 'Autofattura per splafonamento',
  TD22: 'Estrazione beni da Deposito IVA',
  TD23: 'Estrazione beni da Deposito IVA con versamento IVA',
  TD24: 'Fattura differita di cui art.21, comma 4, lett. a)',
  TD25: 'Fattura differita di cui art.21, comma 4, terzo periodo lett. b)',
  TD26: 'Cessione di beni ammortizzabili e per passaggi interni',
  TD27: 'Fattura per autoconsumo o cessioni gratuite senza rivalsa',
}

// Modalità pagamento
export const MODALITA_PAGAMENTO: Record<string, string> = {
  MP01: 'Contanti',
  MP02: 'Assegno',
  MP03: 'Assegno circolare',
  MP04: 'Contanti presso Tesoreria',
  MP05: 'Bonifico',
  MP06: 'Vaglia cambiario',
  MP07: 'Bollettino bancario',
  MP08: 'Carta di pagamento',
  MP09: 'RID',
  MP10: 'RID utenze',
  MP11: 'RID veloce',
  MP12: 'RIBA',
  MP13: 'MAV',
  MP14: 'Quietanza erario',
  MP15: 'Giroconto su conti di contabilità speciale',
  MP16: 'Domiciliazione bancaria',
  MP17: 'Domiciliazione postale',
  MP18: 'Bollettino di c/c postale',
  MP19: 'SEPA Direct Debit',
  MP20: 'SEPA Direct Debit CORE',
  MP21: 'SEPA Direct Debit B2B',
  MP22: 'Trattenuta su somme già riscosse',
  MP23: 'PagoPA',
}

// Natura operazione (per aliquota IVA 0%)
export const NATURA_OPERAZIONE: Record<string, string> = {
  N1: 'Escluse ex art.15',
  N2: 'Non soggette (divise in sottotipi N2.1 e N2.2)',
  'N2.1': 'Non soggette ad IVA - artt. da 7 a 7-septies DPR 633/72',
  'N2.2': 'Non soggette - altri casi',
  N3: 'Non imponibili (divise in sottotipi)',
  'N3.1': 'Non imponibili - esportazioni',
  'N3.2': 'Non imponibili - cessioni intracomunitarie',
  'N3.3': 'Non imponibili - cessioni verso San Marino',
  'N3.4': 'Non imponibili - operazioni assimilate alle cessioni export',
  'N3.5': 'Non imponibili - dichiarazione di intento',
  'N3.6': 'Non imponibili - altre operazioni non concorrenti alla formazione del plafond',
  N4: 'Esenti',
  N5: 'Regime del margine / IVA non esposta in fattura',
  N6: 'Inversione contabile (divise in sottotipi)',
  'N6.1': 'Inversione contabile - cessione di rottami',
  'N6.2': 'Inversione contabile - cessione di oro e argento puro',
  'N6.3': 'Inversione contabile - subappalto nel settore edile',
  'N6.4': 'Inversione contabile - cessione di fabbricati',
  'N6.5': 'Inversione contabile - cessione di telefoni cellulari',
  'N6.6': 'Inversione contabile - cessione di prodotti elettronici',
  'N6.7': 'Inversione contabile - prestazioni comparto edile e settori connessi',
  'N6.8': 'Inversione contabile - operazioni settore energetico',
  'N6.9': 'Inversione contabile - altri casi',
  N7: 'IVA assolta in altro stato UE',
}
