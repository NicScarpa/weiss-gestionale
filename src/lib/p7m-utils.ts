/**
 * P7M File Utilities
 *
 * Handles extraction of XML content from PKCS#7/CAdES signed files (.p7m)
 * commonly used for Italian electronic invoices (FatturaPA)
 */

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
  // Convert to string, handling binary data
  const content = Buffer.isBuffer(buffer)
    ? buffer.toString('binary')
    : Buffer.from(buffer).toString('binary')

  // Try multiple extraction strategies
  let xml = tryXmlDeclarationExtraction(content)
  if (xml) return xml

  xml = tryFatturaTagExtraction(content)
  if (xml) return xml

  xml = tryUtf8Extraction(buffer)
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
  const endPatterns = [
    '</p:FatturaElettronica>',
    '</FatturaElettronica>',
    '</ns0:FatturaElettronica>',
    '</ns1:FatturaElettronica>',
    '</ns2:FatturaElettronica>',
  ]

  let xmlEnd = -1
  let endTag = ''

  for (const pattern of endPatterns) {
    const pos = content.indexOf(pattern, xmlStart)
    if (pos !== -1 && (xmlEnd === -1 || pos < xmlEnd)) {
      xmlEnd = pos
      endTag = pattern
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
  const patterns = [
    /<(?:p:|ns\d:|)FatturaElettronica[^>]*>/,
  ]

  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match) {
      const tagStart = content.indexOf(match[0])
      if (tagStart === -1) continue

      // Determine the namespace prefix used
      const prefixMatch = match[0].match(/<((?:p:|ns\d:|)?)FatturaElettronica/)
      const prefix = prefixMatch ? prefixMatch[1] : ''
      const endTag = `</${prefix}FatturaElettronica>`

      const tagEnd = content.indexOf(endTag, tagStart)
      if (tagEnd === -1) continue

      // Add XML declaration if not present
      const rawXml = content.substring(tagStart, tagEnd + endTag.length)
      const cleanedXml = cleanExtractedXml(rawXml)

      if (!cleanedXml.startsWith('<?xml')) {
        return `<?xml version="1.0" encoding="UTF-8"?>${cleanedXml}`
      }
      return cleanedXml
    }
  }

  return null
}

/**
 * Strategy 3: Try UTF-8 decoding and extraction
 */
function tryUtf8Extraction(buffer: Buffer | ArrayBuffer): string | null {
  try {
    const content = Buffer.isBuffer(buffer)
      ? buffer.toString('utf8')
      : Buffer.from(buffer).toString('utf8')

    // Look for XML content in UTF-8 decoded string
    const xmlMatch = content.match(/<\?xml[\s\S]*?<\/(?:p:|ns\d:|)?FatturaElettronica>/)
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
