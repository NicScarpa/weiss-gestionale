/**
 * Parser per FatturaPA XML (Italian Electronic Invoice)
 * Supporta il formato standard FatturaPA v1.2.1
 */

import { XMLParser } from 'fast-xml-parser'
import type {
  FatturaParsata,
  CedentePrestatore,
  CessionarioCommittente,
  DettaglioLinea,
  DatiRiepilogo,
  DatiPagamento,
  DettaglioPagamento,
  DatiBollo,
} from './types'

// Re-export types and constants for convenience
export { TIPI_DOCUMENTO, MODALITA_PAGAMENTO, NATURA_OPERAZIONE } from './types'

// Parser options
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
  // Gestisce namespace XML
  removeNSPrefix: true,
}

/**
 * Converte un valore in array se non lo è già
 */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Estrae un valore numerico da stringa o numero
 */
function parseDecimal(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    // FatturaPA usa il punto come separatore decimale
    return parseFloat(value.replace(',', '.')) || 0
  }
  return 0
}

/**
 * Estrae il valore testuale da un nodo che può avere #text
 */
function getText(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (typeof node === 'object' && node !== null) {
    const obj = node as Record<string, unknown>
    if ('#text' in obj) return String(obj['#text'])
    return ''
  }
  return ''
}

/**
 * Naviga la struttura XML per trovare il body della fattura
 */
function findFatturaBody(parsed: Record<string, unknown>): Record<string, unknown> | null {
  // Possibili root elements nella FatturaPA
  const rootPaths = [
    'FatturaElettronica',
    'p:FatturaElettronica',
    'ns2:FatturaElettronica',
    'n2:FatturaElettronica',
  ]

  for (const path of rootPaths) {
    if (parsed[path]) {
      return parsed[path] as Record<string, unknown>
    }
  }

  // Se c'è un solo elemento root, usalo
  const keys = Object.keys(parsed)
  if (keys.length === 1) {
    const root = parsed[keys[0]]
    if (root && typeof root === 'object') {
      return root as Record<string, unknown>
    }
  }

  return null
}

/**
 * Estrae i dati del Cedente/Prestatore (Fornitore)
 */
function parseCedentePrestatore(data: Record<string, unknown>): CedentePrestatore {
  const datiAnagrafici = (data.DatiAnagrafici || {}) as Record<string, unknown>
  const idFiscaleIVA = (datiAnagrafici.IdFiscaleIVA || {}) as Record<string, unknown>
  const anagrafica = (datiAnagrafici.Anagrafica || {}) as Record<string, unknown>
  const sede = (data.Sede || {}) as Record<string, unknown>

  // Il nome può essere in Denominazione (aziende) o Nome+Cognome (persone)
  let denominazione = getText(anagrafica.Denominazione)
  if (!denominazione) {
    const nome = getText(anagrafica.Nome)
    const cognome = getText(anagrafica.Cognome)
    denominazione = [nome, cognome].filter(Boolean).join(' ')
  }

  return {
    denominazione,
    partitaIva: getText(idFiscaleIVA.IdCodice) || '',
    codiceFiscale: getText(datiAnagrafici.CodiceFiscale),
    sede: {
      indirizzo: getText(sede.Indirizzo),
      cap: getText(sede.CAP),
      comune: getText(sede.Comune),
      provincia: getText(sede.Provincia),
      nazione: getText(sede.Nazione) || 'IT',
    },
  }
}

/**
 * Estrae i dati del Cessionario/Committente (Cliente)
 */
function parseCessionarioCommittente(data: Record<string, unknown>): CessionarioCommittente {
  const datiAnagrafici = (data.DatiAnagrafici || {}) as Record<string, unknown>
  const idFiscaleIVA = (datiAnagrafici.IdFiscaleIVA || {}) as Record<string, unknown>
  const anagrafica = (datiAnagrafici.Anagrafica || {}) as Record<string, unknown>
  const sede = (data.Sede || {}) as Record<string, unknown>

  let denominazione = getText(anagrafica.Denominazione)
  if (!denominazione) {
    const nome = getText(anagrafica.Nome)
    const cognome = getText(anagrafica.Cognome)
    denominazione = [nome, cognome].filter(Boolean).join(' ')
  }

  return {
    denominazione,
    partitaIva: getText(idFiscaleIVA.IdCodice),
    codiceFiscale: getText(datiAnagrafici.CodiceFiscale),
    sede: {
      indirizzo: getText(sede.Indirizzo),
      cap: getText(sede.CAP),
      comune: getText(sede.Comune),
      provincia: getText(sede.Provincia),
      nazione: getText(sede.Nazione) || 'IT',
    },
  }
}

/**
 * Estrae le linee di dettaglio
 */
function parseDettaglioLinee(datiBeniServizi: Record<string, unknown>): DettaglioLinea[] {
  const linee = toArray(datiBeniServizi.DettaglioLinee)

  return linee.map((linea) => {
    const l = linea as Record<string, unknown>
    return {
      numeroLinea: parseInt(getText(l.NumeroLinea)) || 0,
      descrizione: getText(l.Descrizione),
      quantita: l.Quantita ? parseDecimal(l.Quantita) : undefined,
      unitaMisura: getText(l.UnitaMisura) || undefined,
      prezzoUnitario: parseDecimal(l.PrezzoUnitario),
      prezzoTotale: parseDecimal(l.PrezzoTotale),
      aliquotaIVA: parseDecimal(l.AliquotaIVA),
    }
  })
}

/**
 * Estrae il riepilogo IVA
 */
function parseDatiRiepilogo(datiBeniServizi: Record<string, unknown>): DatiRiepilogo[] {
  const riepiloghi = toArray(datiBeniServizi.DatiRiepilogo)

  return riepiloghi.map((riepilogo) => {
    const r = riepilogo as Record<string, unknown>
    return {
      aliquotaIVA: parseDecimal(r.AliquotaIVA),
      imponibileImporto: parseDecimal(r.ImponibileImporto),
      imposta: parseDecimal(r.Imposta),
      natura: getText(r.Natura) || undefined,
    }
  })
}

/**
 * Estrae i dati di pagamento
 */
function parseDatiPagamento(data: unknown): DatiPagamento | undefined {
  if (!data) return undefined

  const datiArray = toArray(data)
  if (datiArray.length === 0) return undefined

  // Prendi il primo blocco pagamento (di solito ce n'è uno solo)
  const datiPag = datiArray[0] as Record<string, unknown>

  const dettagli = toArray(datiPag.DettaglioPagamento).map((d) => {
    const det = d as Record<string, unknown>
    return {
      modalitaPagamento: getText(det.ModalitaPagamento),
      dataScadenzaPagamento: getText(det.DataScadenzaPagamento) || undefined,
      importoPagamento: parseDecimal(det.ImportoPagamento),
      istitutoFinanziario: getText(det.IstitutoFinanziario) || undefined,
      iban: getText(det.IBAN) || undefined,
    } as DettaglioPagamento
  })

  return {
    condizioniPagamento: getText(datiPag.CondizioniPagamento),
    dettagliPagamento: dettagli,
  }
}

/**
 * Estrae i dati del bollo virtuale
 */
function parseDatiBollo(datiGeneraliDocumento: Record<string, unknown>): DatiBollo | undefined {
  const datiBollo = datiGeneraliDocumento.DatiBollo as Record<string, unknown> | undefined
  if (!datiBollo) return undefined

  return {
    bolloVirtuale: getText(datiBollo.BolloVirtuale) || undefined,
    importoBollo: datiBollo.ImportoBollo ? parseDecimal(datiBollo.ImportoBollo) : undefined,
  }
}

/**
 * Parser principale per FatturaPA XML
 */
export function parseFatturaPA(xmlContent: string, fileName?: string): FatturaParsata {
  const parser = new XMLParser(parserOptions)
  const parsed = parser.parse(xmlContent) as Record<string, unknown>

  // Trova il root della fattura
  const fattura = findFatturaBody(parsed)
  if (!fattura) {
    throw new Error('Formato XML non riconosciuto: root FatturaElettronica non trovato')
  }

  // Header trasmissione
  const header = (fattura.FatturaElettronicaHeader || {}) as Record<string, unknown>
  const datiTrasmissione = (header.DatiTrasmissione || {}) as Record<string, unknown>
  const idTrasmittente = (datiTrasmissione.IdTrasmittente || {}) as Record<string, unknown>

  // Cedente e Cessionario
  const cedente = (header.CedentePrestatore || {}) as Record<string, unknown>
  const cessionario = (header.CessionarioCommittente || {}) as Record<string, unknown>

  // Body fattura (può essere array per fatture multiple)
  const bodyArray = toArray(fattura.FatturaElettronicaBody)
  if (bodyArray.length === 0) {
    throw new Error('Nessun body fattura trovato nel documento')
  }

  // Prendi la prima fattura (di solito ce n'è una sola)
  const body = bodyArray[0] as Record<string, unknown>
  const datiGenerali = (body.DatiGenerali || {}) as Record<string, unknown>
  const datiGeneraliDocumento = (datiGenerali.DatiGeneraliDocumento || {}) as Record<
    string,
    unknown
  >
  const datiBeniServizi = (body.DatiBeniServizi || {}) as Record<string, unknown>

  // Causale può essere array o stringa singola
  const causaleRaw = datiGeneraliDocumento.Causale
  const causale = causaleRaw
    ? toArray(causaleRaw).map((c) => getText(c))
    : undefined

  // Costruisci il risultato
  const result: FatturaParsata = {
    // Header
    progressivoInvio: getText(datiTrasmissione.ProgressivoInvio),
    formatoTrasmissione: getText(datiTrasmissione.FormatoTrasmissione),
    codiceDestinatario: getText(datiTrasmissione.CodiceDestinatario) || undefined,
    pecDestinatario: getText(datiTrasmissione.PECDestinatario) || undefined,

    // Parti
    cedentePrestatore: parseCedentePrestatore(cedente),
    cessionarioCommittente: parseCessionarioCommittente(cessionario),

    // Documento
    tipoDocumento: getText(datiGeneraliDocumento.TipoDocumento),
    divisa: getText(datiGeneraliDocumento.Divisa) || 'EUR',
    data: getText(datiGeneraliDocumento.Data),
    numero: getText(datiGeneraliDocumento.Numero),
    causale,

    // Importi
    importoTotaleDocumento: parseDecimal(datiGeneraliDocumento.ImportoTotaleDocumento),
    arrotondamento: datiGeneraliDocumento.Arrotondamento
      ? parseDecimal(datiGeneraliDocumento.Arrotondamento)
      : undefined,

    // Dettagli
    dettaglioLinee: parseDettaglioLinee(datiBeniServizi),
    datiRiepilogo: parseDatiRiepilogo(datiBeniServizi),

    // Pagamento
    datiPagamento: parseDatiPagamento(body.DatiPagamento),

    // Bollo
    datiBollo: parseDatiBollo(datiGeneraliDocumento),

    // Metadati
    xmlOriginale: xmlContent,
    nomeFile: fileName,
  }

  // Validazione base
  if (!result.cedentePrestatore.partitaIva && !result.cedentePrestatore.codiceFiscale) {
    throw new Error('Partita IVA o Codice Fiscale del fornitore non trovati')
  }

  if (!result.numero) {
    throw new Error('Numero fattura non trovato')
  }

  if (!result.data) {
    throw new Error('Data fattura non trovata')
  }

  return result
}

/**
 * Calcola totali dalla fattura parsata
 */
export function calcolaImporti(fattura: FatturaParsata): {
  netAmount: number
  vatAmount: number
  totalAmount: number
} {
  // Se l'importo totale è presente nel documento, usalo
  if (fattura.importoTotaleDocumento > 0) {
    const vatAmount = fattura.datiRiepilogo.reduce((sum, r) => sum + r.imposta, 0)
    const netAmount = fattura.datiRiepilogo.reduce((sum, r) => sum + r.imponibileImporto, 0)
    return {
      netAmount,
      vatAmount,
      totalAmount: fattura.importoTotaleDocumento,
    }
  }

  // Altrimenti calcola dai riepiloghi
  const netAmount = fattura.datiRiepilogo.reduce((sum, r) => sum + r.imponibileImporto, 0)
  const vatAmount = fattura.datiRiepilogo.reduce((sum, r) => sum + r.imposta, 0)
  const totalAmount = netAmount + vatAmount + (fattura.arrotondamento || 0)

  return { netAmount, vatAmount, totalAmount }
}

/**
 * Estrae le scadenze di pagamento dalla fattura
 */
export function estraiScadenze(fattura: FatturaParsata): Array<{
  dueDate: Date
  amount: number
  paymentMethod: string
}> {
  if (!fattura.datiPagamento) {
    // Nessun dato pagamento: crea scadenza unica alla data fattura
    const { totalAmount } = calcolaImporti(fattura)
    return [
      {
        dueDate: new Date(fattura.data),
        amount: totalAmount,
        paymentMethod: 'NON_SPECIFICATO',
      },
    ]
  }

  return fattura.datiPagamento.dettagliPagamento.map((d) => ({
    dueDate: d.dataScadenzaPagamento
      ? new Date(d.dataScadenzaPagamento)
      : new Date(fattura.data),
    amount: d.importoPagamento,
    paymentMethod: d.modalitaPagamento,
  }))
}
