/**
 * P7M File Utilities
 *
 * Handles extraction of XML content from PKCS#7/CAdES signed files (.p7m)
 * commonly used for Italian electronic invoices (FatturaPA)
 */

// ============================================================================
// Logging Diagnostico per Debug Estrazione P7M
// ============================================================================

/**
 * Livello di log per diagnostica P7M
 */
export type P7mLogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Entry di log per estrazione P7M
 */
export interface P7mLogEntry {
  timestamp: string
  level: P7mLogLevel
  phase: string
  message: string
  data?: Record<string, unknown>
}

/**
 * Risultato estrazione P7M con diagnostica
 */
export interface P7mExtractionResult {
  success: boolean
  xml?: string
  error?: string
  logs: P7mLogEntry[]
  diagnostics: {
    fileSize: number
    extractionStrategy: string | null
    xmlDeclFound: boolean
    fatturaTagFound: boolean
    cleaningApplied: string[]
  }
}

// Logger interno
const createLogEntry = (
  level: P7mLogLevel,
  phase: string,
  message: string,
  data?: Record<string, unknown>
): P7mLogEntry => ({
  timestamp: new Date().toISOString(),
  level,
  phase,
  message,
  data,
})

/**
 * Estrae XML da P7M con logging diagnostico completo
 *
 * @param buffer - Il contenuto del file P7M
 * @param fileName - Nome file per logging (opzionale)
 * @returns Risultato con XML, errori e log diagnostici
 */
export function extractXmlFromP7mWithDiagnostics(
  buffer: Buffer | ArrayBuffer,
  fileName?: string
): P7mExtractionResult {
  const logs: P7mLogEntry[] = []
  const cleaningApplied: string[] = []

  const log = (level: P7mLogLevel, phase: string, message: string, data?: Record<string, unknown>) => {
    logs.push(createLogEntry(level, phase, message, data))
    // In development, also log to console
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[P7M:${phase}]`
      if (level === 'error') console.error(prefix, message, data || '')
      else if (level === 'warn') console.warn(prefix, message, data || '')
      else if (level === 'debug') console.debug(prefix, message, data || '')
      else console.log(prefix, message, data || '')
    }
  }

  const diagnostics: P7mExtractionResult['diagnostics'] = {
    fileSize: 0,
    extractionStrategy: null,
    xmlDeclFound: false,
    fatturaTagFound: false,
    cleaningApplied: [],
  }

  try {
    log('info', 'init', `Inizio estrazione XML da P7M${fileName ? `: ${fileName}` : ''}`)

    // Converti buffer
    let content: string
    let arrayBuffer: ArrayBuffer

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
      content = buffer.toString('binary')
      arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
      diagnostics.fileSize = buffer.length
    } else {
      arrayBuffer = buffer as ArrayBuffer
      content = arrayBufferToBinaryString(arrayBuffer)
      diagnostics.fileSize = arrayBuffer.byteLength
    }

    log('debug', 'buffer', `File size: ${diagnostics.fileSize} bytes`)

    // Check struttura P7M
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    if (bytes[0] === 0x30) {
      log('debug', 'p7m-check', 'P7M signature detected (0x30 SEQUENCE tag)')
    }

    // Strategia 1: XML Declaration
    log('debug', 'strategy-1', 'Tentativo estrazione con XML declaration')
    diagnostics.xmlDeclFound = content.includes('<?xml')

    if (diagnostics.xmlDeclFound) {
      log('debug', 'strategy-1', 'XML declaration trovata', {
        position: content.indexOf('<?xml'),
      })

      const xml = tryXmlDeclarationExtraction(content)
      if (xml) {
        diagnostics.extractionStrategy = 'xml-declaration'
        log('info', 'strategy-1', 'Estrazione completata con successo via XML declaration')
        return {
          success: true,
          xml: cleanExtractedXmlWithLogging(xml, log, cleaningApplied),
          logs,
          diagnostics: { ...diagnostics, cleaningApplied },
        }
      }
      log('debug', 'strategy-1', 'Strategia XML declaration fallita, provo prossima')
    }

    // Strategia 2: FatturaElettronica tag
    log('debug', 'strategy-2', 'Tentativo estrazione con FatturaElettronica tag')
    diagnostics.fatturaTagFound = /<([a-zA-Z]\w*:)?FatturaElettronica/.test(content)

    if (diagnostics.fatturaTagFound) {
      log('debug', 'strategy-2', 'Tag FatturaElettronica trovato')

      const xml = tryFatturaTagExtraction(content)
      if (xml) {
        diagnostics.extractionStrategy = 'fattura-tag'
        log('info', 'strategy-2', 'Estrazione completata con successo via FatturaElettronica tag')
        return {
          success: true,
          xml: cleanExtractedXmlWithLogging(xml, log, cleaningApplied),
          logs,
          diagnostics: { ...diagnostics, cleaningApplied },
        }
      }
      log('debug', 'strategy-2', 'Strategia FatturaElettronica tag fallita, provo prossima')
    }

    // Strategia 3: UTF-8 extraction
    log('debug', 'strategy-3', 'Tentativo estrazione con UTF-8 decoding')
    let xml = tryUtf8Extraction(arrayBuffer)
    if (xml) {
      diagnostics.extractionStrategy = 'utf8'
      log('info', 'strategy-3', 'Estrazione completata con successo via UTF-8')
      return {
        success: true,
        xml: cleanExtractedXmlWithLogging(xml, log, cleaningApplied),
        logs,
        diagnostics: { ...diagnostics, cleaningApplied },
      }
    }

    // Strategia 4: Base64 decoding (P7M in formato testo Base64)
    log('debug', 'strategy-4', 'Tentativo estrazione con decodifica Base64')
    xml = tryBase64Extraction(bytes)
    if (xml) {
      diagnostics.extractionStrategy = 'base64'
      log('info', 'strategy-4', 'Estrazione completata con successo via Base64 decoding')
      return {
        success: true,
        xml: cleanExtractedXmlWithLogging(xml, log, cleaningApplied),
        logs,
        diagnostics: { ...diagnostics, cleaningApplied },
      }
    }

    // Nessuna strategia ha funzionato
    log('error', 'extraction', 'Tutte le strategie di estrazione fallite')
    return {
      success: false,
      error: 'Impossibile estrarre il contenuto XML dal file P7M',
      logs,
      diagnostics: { ...diagnostics, cleaningApplied },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto'
    log('error', 'exception', `Eccezione durante estrazione: ${errorMessage}`)
    return {
      success: false,
      error: errorMessage,
      logs,
      diagnostics: { ...diagnostics, cleaningApplied },
    }
  }
}

/**
 * Versione di cleanExtractedXml che registra le pulizie applicate
 */
function cleanExtractedXmlWithLogging(
  xml: string,
  log: (level: P7mLogLevel, phase: string, message: string, data?: Record<string, unknown>) => void,
  cleaningApplied: string[]
): string {
  let result = xml

  // Track lunghezza originale
  const originalLength = result.length

  // Fix 0: Rimuovi byte high
  const beforeHighBytes = result.length
  result = result.replace(/[\x80-\x9F\xA0-\xBF\xC0-\xFF]/g, '')
  if (result.length !== beforeHighBytes) {
    cleaningApplied.push('high-bytes-removed')
    log('debug', 'cleaning', `Rimossi ${beforeHighBytes - result.length} high bytes`)
  }

  // Applica il resto della pulizia standard
  result = cleanExtractedXml(xml)

  // Log riepilogo
  const finalLength = result.length
  if (finalLength !== originalLength) {
    log('debug', 'cleaning', `Pulizia completata: ${originalLength} -> ${finalLength} bytes`, {
      bytesRemoved: originalLength - finalLength,
    })
  }

  return result
}

/**
 * Convert ArrayBuffer to binary string (browser-compatible)
 */
function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return binary
}

/**
 * Convert ArrayBuffer to UTF-8 string (browser-compatible)
 */
function arrayBufferToUtf8String(buffer: ArrayBuffer): string {
  try {
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(buffer)
  } catch {
    // Fallback to binary string if UTF-8 decoding fails
    return arrayBufferToBinaryString(buffer)
  }
}

/**
 * Extract XML content from a P7M (PKCS#7 signed) file buffer
 *
 * P7M files are PKCS#7/CMS envelopes that contain:
 * - Digital signature(s)
 * - The original content (in our case, XML)
 *
 * This function uses a pattern-matching approach to extract the XML
 * content from the binary envelope, which works for most FatturaPA files.
 *
 * @param buffer - The P7M file content as Buffer or ArrayBuffer
 * @returns The extracted XML string
 * @throws Error if XML content cannot be extracted
 */
export function extractXmlFromP7m(buffer: Buffer | ArrayBuffer): string {
  // Convert to binary string, handling both Node.js Buffer and browser ArrayBuffer
  let content: string
  let arrayBuffer: ArrayBuffer
  let originalBuffer: Buffer

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    // Node.js environment
    originalBuffer = buffer
    content = buffer.toString('binary')
    arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  } else {
    // Browser environment - use ArrayBuffer directly
    arrayBuffer = buffer as ArrayBuffer
    originalBuffer = Buffer.from(new Uint8Array(arrayBuffer))
    content = arrayBufferToBinaryString(arrayBuffer)
  }

  // Try multiple extraction strategies
  let xml = tryXmlDeclarationExtraction(content)
  if (xml) return xml

  xml = tryFatturaTagExtraction(content)
  if (xml) return xml

  xml = tryUtf8Extraction(arrayBuffer)
  if (xml) return xml

  // Strategy 4: Try Base64 decoding (some P7M files are Base64 encoded)
  xml = tryBase64Extraction(originalBuffer)
  if (xml) return xml

  throw new Error('Impossibile estrarre il contenuto XML dal file P7M. Il file potrebbe essere corrotto o in un formato non supportato.')
}

/**
 * Strategy 1: Look for XML declaration and extract until the end tag
 */
function tryXmlDeclarationExtraction(content: string): string | null {
  // Look for XML declaration
  const xmlDeclMatch = content.match(/<\?xml\s+version=["'][^"']*["'][^?]*\?>/)
  if (!xmlDeclMatch) return null

  const xmlStart = content.indexOf(xmlDeclMatch[0])
  if (xmlStart === -1) return null

  // Find the end of the FatturaElettronica document
  // Handle both namespaced and non-namespaced versions
  // Use regex to find any namespace prefix (e.g., p:, ns2:, b:, n2:, etc.)
  // Also handle corrupted tags with characters in the middle (e.g., </Fattu\nraElettronica>)
  // The pattern allows for any non-letter characters between parts of the tag name
  const endTagRegex = /<\/(?:[a-zA-Z]\w*:)?F[^<>]*a[^<>]*t[^<>]*t[^<>]*u[^<>]*r[^<>]*a[^<>]*E[^<>]*l[^<>]*e[^<>]*t[^<>]*t[^<>]*r[^<>]*o[^<>]*n[^<>]*i[^<>]*c[^<>]*a[^<>]*>/gi
  let endTagMatch: RegExpExecArray | null = null
  let xmlEnd = -1
  let endTag = ''

  // Find the last occurrence of the end tag after xmlStart
  while ((endTagMatch = endTagRegex.exec(content)) !== null) {
    if (endTagMatch.index >= xmlStart) {
      xmlEnd = endTagMatch.index
      endTag = endTagMatch[0]
    }
  }

  if (xmlEnd === -1) return null

  // Extract and clean the XML
  const rawXml = content.substring(xmlStart, xmlEnd + endTag.length)
  return cleanExtractedXml(rawXml)
}

/**
 * Strategy 2: Look for FatturaElettronica opening tag directly
 */
function tryFatturaTagExtraction(content: string): string | null {
  // Look for FatturaElettronica opening tag (with or without namespace)
  // Support any namespace prefix: p:, ns0-9:, b:, n2:, etc.
  const openTagRegex = /<([a-zA-Z]\w*:)?FatturaElettronica[^>]*>/
  const match = content.match(openTagRegex)

  if (!match) return null

  const tagStart = content.indexOf(match[0])
  if (tagStart === -1) return null

  // Extract the namespace prefix used (group 1 from regex)
  const prefix = match[1] || ''
  const endTag = `</${prefix}FatturaElettronica>`

  const tagEnd = content.indexOf(endTag, tagStart)
  if (tagEnd === -1) return null

  // Add XML declaration if not present
  const rawXml = content.substring(tagStart, tagEnd + endTag.length)
  const cleanedXml = cleanExtractedXml(rawXml)

  if (!cleanedXml.startsWith('<?xml')) {
    return `<?xml version="1.0" encoding="UTF-8"?>${cleanedXml}`
  }
  return cleanedXml
}

/**
 * Strategy 3: Try UTF-8 decoding and extraction
 */
function tryUtf8Extraction(buffer: ArrayBuffer): string | null {
  try {
    const content = arrayBufferToUtf8String(buffer)

    // Look for XML content in UTF-8 decoded string
    // Support any namespace prefix: p:, ns0-9:, b:, n2:, etc.
    const xmlMatch = content.match(/<\?xml[\s\S]*?<\/(?:[a-zA-Z]\w*:)?FatturaElettronica>/)
    if (xmlMatch) {
      return cleanExtractedXml(xmlMatch[0])
    }
  } catch {
    // UTF-8 decoding failed, that's okay
  }
  return null
}

/**
 * Strategy 4: Try Base64 decoding
 * Some P7M files are encoded in Base64 format (ASCII text containing Base64 data)
 * This is common when P7M files are transmitted via email or web services
 */
function tryBase64Extraction(buffer: Buffer): string | null {
  try {
    // Check if content looks like Base64 (starts with typical PKCS#7 Base64 header)
    const asciiContent = buffer.toString('ascii')

    // Base64 P7M typically starts with "MIA" or "MII" (ASN.1 SEQUENCE in Base64)
    if (!asciiContent.match(/^MI[AIQ]/)) {
      return null
    }

    // Verify it's valid Base64 (only Base64 characters)
    if (!/^[A-Za-z0-9+/=\s]+$/.test(asciiContent)) {
      return null
    }

    // Decode Base64 to binary
    const decodedBuffer = Buffer.from(asciiContent, 'base64')

    // Now try to extract XML from the decoded binary P7M
    const decodedContent = decodedBuffer.toString('binary')

    // Try XML declaration extraction on decoded content
    let xml = tryXmlDeclarationExtraction(decodedContent)
    if (xml) return xml

    // Try FatturaElettronica tag extraction on decoded content
    xml = tryFatturaTagExtraction(decodedContent)
    if (xml) return xml

    // Try UTF-8 extraction on decoded content
    const decodedArrayBuffer = decodedBuffer.buffer.slice(
      decodedBuffer.byteOffset,
      decodedBuffer.byteOffset + decodedBuffer.byteLength
    ) as ArrayBuffer
    xml = tryUtf8Extraction(decodedArrayBuffer)
    if (xml) return xml

    return null
  } catch {
    // Base64 decoding failed, that's okay
    return null
  }
}

/**
 * Clean extracted XML content
 * - Remove null bytes and control characters
 * - Repair corrupted XML tags from P7M signature
 * - Normalize whitespace issues
 * - Ensure proper encoding
 */
function cleanExtractedXml(xml: string): string {
  let result = xml
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove other control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // Fix potential encoding issues with common Italian characters
    .replace(/\ufffd/g, '')
    // Remove high surrogate characters that can corrupt tags
    .replace(/[\uD800-\uDFFF]/g, '')
    // Remove other problematic Unicode characters
    .replace(/[\uFFF0-\uFFFF]/g, '')

  //
  // FIX GENERICO: Rimuovi caratteri corrotti da TUTTI i tag XML
  //

  // Fix 0: Rimuovi byte high (0x80-0xFF) che non sono caratteri UTF-8 validi
  // Questi sono spesso byte della firma P7M inseriti nel contenuto
  // Rimuovi tutti i byte nel range 0x80-0xFF eccetto caratteri accentati comuni
  result = result.replace(/[\x80-\x9F\xA0-\xBF\xC0-\xFF]/g, '')

  // Fix 0b: Rimuovi garbage prima del contenuto XML valido
  // Cerca la dichiarazione XML o il tag FatturaElettronica e rimuovi tutto prima
  const xmlDeclStart = result.indexOf('<?xml')
  const fatturaStart = result.search(/<([a-zA-Z0-9]+:)?FatturaElettronica/)

  if (xmlDeclStart > 0) {
    // C'è una dichiarazione XML ma con garbage prima
    result = result.substring(xmlDeclStart)
  } else if (fatturaStart > 0 && xmlDeclStart === -1) {
    // Non c'è dichiarazione XML, inizia da FatturaElettronica
    result = '<?xml version="1.0" encoding="UTF-8"?>' + result.substring(fatturaStart)
  } else if (xmlDeclStart === -1 && fatturaStart === 0) {
    // FatturaElettronica all'inizio ma manca dichiarazione XML
    result = '<?xml version="1.0" encoding="UTF-8"?>' + result
  }

  // Fix 0c: Rimuovi processing instructions corrotte (es. stylesheet malformati)
  // Es: "</xsl" href="fatturapa_v1.2.xsl"?>" -> rimosso
  result = result.replace(/<\/[^>]*\?>/g, '')

  // Fix 1: Rimuovi caratteri non-alfanumerici tra < e / nei closing tag
  // Es: "<\x03\xe8/Contatti>" -> "</Contatti>"
  // NOTA: Escludi processing instructions (<?...) e commenti (<!...)
  result = result.replace(/<[^a-zA-Z\/\?!][^\/]*\/([a-zA-Z])/g, '</$1')

  // Fix 2: Fix closing tag root FatturaElettronica con caratteri corrotti
  // Es: "</Fattu\nraElettronica>" -> "</FatturaElettronica>"
  result = result.replace(/<\/([a-zA-Z0-9:]*)?F[^a-zA-Z]*a[^a-zA-Z]*t[^a-zA-Z]*t[^a-zA-Z]*u[^a-zA-Z]*r[^a-zA-Z]*a[^a-zA-Z]*E[^a-zA-Z]*l[^a-zA-Z]*e[^a-zA-Z]*t[^a-zA-Z]*t[^a-zA-Z]*r[^a-zA-Z]*o[^a-zA-Z]*n[^a-zA-Z]*i[^a-zA-Z]*c[^a-zA-Z]*a[^>]*>/gi, '</$1FatturaElettronica>')

  //
  // PULISCI CONTENUTO TAG - Rimuovi newline e caratteri di controllo dal contenuto
  // Es: "<IdCodice>0\n1514230265</IdCodice>" -> "<IdCodice>01514230265</IdCodice>"
  result = result.replace(/>([^<]*)</g, (match, content) => {
    // Rimuovi newline, carriage return e caratteri di controllo dal contenuto
    const cleaned = content.replace(/[\r\n\x00-\x1F]/g, '')
    return `>${cleaned}<`
  })

  //
  // RIPARA TAG XML SPECIFICI CORROTTI DA FIRMA DIGITALE P7M
  // I file P7M possono avere byte della firma mescolati nel contenuto XML
  //
  result = result
    // Tag Anagrafica (es. "Ana��grafica" -> "Anagrafica")
    .replace(/<Ana[^a-zA-Z<>]*grafica>/gi, '<Anagrafica>')
    .replace(/<\/Ana[^a-zA-Z<>]*grafica>/gi, '</Anagrafica>')
    // Tag Denominazione
    .replace(/<Denominazi[^a-zA-Z<>]*one>/gi, '<Denominazione>')
    .replace(/<\/Denominazi[^a-zA-Z<>]*one>/gi, '</Denominazione>')
    // Tag IdFiscaleIVA
    .replace(/<IdFiscale[^a-zA-Z<>]*IVA>/gi, '<IdFiscaleIVA>')
    .replace(/<\/IdFiscale[^a-zA-Z<>]*IVA>/gi, '</IdFiscaleIVA>')
    // Tag CodiceFiscale
    .replace(/<Codice[^a-zA-Z<>]*Fiscale>/gi, '<CodiceFiscale>')
    .replace(/<\/Codice[^a-zA-Z<>]*Fiscale>/gi, '</CodiceFiscale>')
    // Tag CedentePrestatore
    .replace(/<Cedente[^a-zA-Z<>]*Prestatore>/gi, '<CedentePrestatore>')
    .replace(/<\/Cedente[^a-zA-Z<>]*Prestatore>/gi, '</CedentePrestatore>')
    // Tag CessionarioCommittente
    .replace(/<Cessionario[^a-zA-Z<>]*Committente>/gi, '<CessionarioCommittente>')
    .replace(/<\/Cessionario[^a-zA-Z<>]*Committente>/gi, '</CessionarioCommittente>')
    // Tag DatiAnagrafici
    .replace(/<Dati[^a-zA-Z<>]*Anagrafici>/gi, '<DatiAnagrafici>')
    .replace(/<\/Dati[^a-zA-Z<>]*Anagrafici>/gi, '</DatiAnagrafici>')
    // Tag IdCodice (per P.IVA)
    .replace(/<Id[^a-zA-Z<>]*Codice>/gi, '<IdCodice>')
    .replace(/<\/Id[^a-zA-Z<>]*Codice>/gi, '</IdCodice>')
    // Tag ImportoTotaleDocumento
    .replace(/<Importo[^a-zA-Z<>]*Totale[^a-zA-Z<>]*Documento>/gi, '<ImportoTotaleDocumento>')
    .replace(/<\/Importo[^a-zA-Z<>]*Totale[^a-zA-Z<>]*Documento>/gi, '</ImportoTotaleDocumento>')
    // Tag DataScadenzaPagamento
    .replace(/<Data[^a-zA-Z<>]*Scadenza[^a-zA-Z<>]*Pagamento>/gi, '<DataScadenzaPagamento>')
    .replace(/<\/Data[^a-zA-Z<>]*Scadenza[^a-zA-Z<>]*Pagamento>/gi, '</DataScadenzaPagamento>')
    // Tag CodiceValore
    .replace(/<Codice[^a-zA-Z<>]*Valore>/gi, '<CodiceValore>')
    .replace(/<\/Codice[^a-zA-Z<>]*Valore>/gi, '</CodiceValore>')
    // Tag RegimeFiscale
    .replace(/<Regime[^a-zA-Z<>]*Fiscale>/gi, '<RegimeFiscale>')
    .replace(/<\/Regime[^a-zA-Z<>]*Fiscale>/gi, '</RegimeFiscale>')
    // Tag FatturaElettronicaHeader (gestisce anche caratteri corrotti come "FatturaElèettronicaHeader")
    .replace(/<Fattura[^a-zA-Z<>]*Elettronica[^a-zA-Z<>]*Header([^>]*)>/gi, '<FatturaElettronicaHeader$1>')
    .replace(/<\/Fattura[^a-zA-Z<>]*Elettronica[^a-zA-Z<>]*Header>/gi, '</FatturaElettronicaHeader>')
    .replace(/<FatturaEl[^a-zA-Z<>]*ettronicaHeader([^>]*)>/gi, '<FatturaElettronicaHeader$1>')
    .replace(/<\/FatturaEl[^a-zA-Z<>]*ettronicaHeader>/gi, '</FatturaElettronicaHeader>')
    // Tag FatturaElettronicaBody (gestisce anche caratteri corrotti come "FatturaElèettronicaBody")
    .replace(/<Fattura[^a-zA-Z<>]*Elettronica[^a-zA-Z<>]*Body([^>]*)>/gi, '<FatturaElettronicaBody$1>')
    .replace(/<\/Fattura[^a-zA-Z<>]*Elettronica[^a-zA-Z<>]*Body>/gi, '</FatturaElettronicaBody>')
    .replace(/<FatturaEl[^a-zA-Z<>]*ettronicaBody([^>]*)>/gi, '<FatturaElettronicaBody$1>')
    .replace(/<\/FatturaEl[^a-zA-Z<>]*ettronicaBody>/gi, '</FatturaElettronicaBody>')
    // Tag DatiGenerali (senza Documento)
    .replace(/<Dati[^a-zA-Z<>]*Generali>/gi, '<DatiGenerali>')
    .replace(/<\/Dati[^a-zA-Z<>]*Generali>/gi, '</DatiGenerali>')
    // Tag DatiGeneraliDocumento
    .replace(/<Dati[^a-zA-Z<>]*Generali[^a-zA-Z<>]*Documento>/gi, '<DatiGeneraliDocumento>')
    .replace(/<\/Dati[^a-zA-Z<>]*Generali[^a-zA-Z<>]*Documento>/gi, '</DatiGeneraliDocumento>')
    // Tag DatiBeniServizi
    .replace(/<Dati[^a-zA-Z<>]*Beni[^a-zA-Z<>]*Servizi>/gi, '<DatiBeniServizi>')
    .replace(/<\/Dati[^a-zA-Z<>]*Beni[^a-zA-Z<>]*Servizi>/gi, '</DatiBeniServizi>')
    // Tag DettaglioLinee
    .replace(/<Dettaglio[^a-zA-Z<>]*Linee>/gi, '<DettaglioLinee>')
    .replace(/<\/Dettaglio[^a-zA-Z<>]*Linee>/gi, '</DettaglioLinee>')
    // Tag DatiRiepilogo
    .replace(/<Dati[^a-zA-Z<>]*Riepilogo>/gi, '<DatiRiepilogo>')
    .replace(/<\/Dati[^a-zA-Z<>]*Riepilogo>/gi, '</DatiRiepilogo>')
    // Tag DatiPagamento
    .replace(/<Dati[^a-zA-Z<>]*Pagamento>/gi, '<DatiPagamento>')
    .replace(/<\/Dati[^a-zA-Z<>]*Pagamento>/gi, '</DatiPagamento>')
    // Tag Contatti
    .replace(/<Con[^a-zA-Z<>]*tatti>/gi, '<Contatti>')
    .replace(/<\/Con[^a-zA-Z<>]*tatti>/gi, '</Contatti>')
    // Tag DatiTrasporto
    .replace(/<Dati[^a-zA-Z<>]*Trasporto>/gi, '<DatiTrasporto>')
    .replace(/<\/Dati[^a-zA-Z<>]*Trasporto>/gi, '</DatiTrasporto>')
    // Tag DettaglioPagamento
    .replace(/<Dettaglio[^a-zA-Z<>]*Pagamento>/gi, '<DettaglioPagamento>')
    .replace(/<\/Dettaglio[^a-zA-Z<>]*Pagamento>/gi, '</DettaglioPagamento>')
    // Tag PrezzoTotale
    .replace(/<Prezzo[^a-zA-Z<>]*Totale>/gi, '<PrezzoTotale>')
    .replace(/<\/Prezzo[^a-zA-Z<>]*Totale>/gi, '</PrezzoTotale>')
    // Tag Quantita
    .replace(/<Quanti[^a-zA-Z<>]*ta>/gi, '<Quantita>')
    .replace(/<\/Quanti[^a-zA-Z<>]*ta>/gi, '</Quantita>')
    // Tag Sede
    .replace(/<Se[^a-zA-Z<>]*de>/gi, '<Sede>')
    .replace(/<\/Se[^a-zA-Z<>]*de>/gi, '</Sede>')

  return result.trim()
}

/**
 * Check if a file is a P7M file based on its name or content
 */
export function isP7mFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.p7m')
}

/**
 * Check if content appears to be a P7M/PKCS#7 file
 * PKCS#7 files in DER format start with specific ASN.1 sequence bytes
 */
export function isP7mContent(buffer: Buffer | ArrayBuffer): boolean {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

  if (bytes.length < 2) return false

  // PKCS#7 DER format starts with 0x30 (SEQUENCE tag)
  // followed by length encoding
  if (bytes[0] === 0x30) {
    // Check for content-type OID for signed-data (1.2.840.113549.1.7.2)
    const contentTypeOid = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02])
    return bytes.includes(contentTypeOid)
  }

  return false
}

/**
 * Get the appropriate file type from filename
 */
export function getInvoiceFileType(filename: string): 'xml' | 'p7m' | 'unknown' {
  const lowerName = filename.toLowerCase()
  if (lowerName.endsWith('.p7m')) return 'p7m'
  if (lowerName.endsWith('.xml')) return 'xml'
  return 'unknown'
}
