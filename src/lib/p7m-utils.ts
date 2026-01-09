/**
 * P7M File Utilities
 *
 * Handles extraction of XML content from PKCS#7/CAdES signed files (.p7m)
 * commonly used for Italian electronic invoices (FatturaPA)
 */

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

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    // Node.js environment
    content = buffer.toString('binary')
    arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  } else {
    // Browser environment - use ArrayBuffer directly
    arrayBuffer = buffer as ArrayBuffer
    content = arrayBufferToBinaryString(arrayBuffer)
  }

  // Try multiple extraction strategies
  let xml = tryXmlDeclarationExtraction(content)
  if (xml) return xml

  xml = tryFatturaTagExtraction(content)
  if (xml) return xml

  xml = tryUtf8Extraction(arrayBuffer)
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
  const endTagRegex = /<\/(?:[a-zA-Z]\w*:)?FatturaElettronica>/g
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
 * Clean extracted XML content
 * - Remove null bytes and control characters
 * - Repair corrupted XML tags from P7M signature
 * - Normalize whitespace issues
 * - Ensure proper encoding
 */
function cleanExtractedXml(xml: string): string {
  return xml
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
    // PULISCI CONTENUTO TAG - Rimuovi newline e caratteri di controllo dal contenuto
    // Es: "<IdCodice>0\n1514230265</IdCodice>" -> "<IdCodice>01514230265</IdCodice>"
    .replace(/>([^<]*)</g, (match, content) => {
      // Rimuovi newline, carriage return e caratteri di controllo dal contenuto
      const cleaned = content.replace(/[\r\n\x00-\x1F]/g, '')
      return `>${cleaned}<`
    })
    //
    // RIPARA TAG XML CORROTTI DA FIRMA DIGITALE P7M
    // I file P7M possono avere byte della firma mescolati nel contenuto XML
    //
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
    // Trim whitespace
    .trim()
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
