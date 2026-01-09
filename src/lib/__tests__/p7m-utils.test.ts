import { describe, it, expect } from 'vitest'
import {
  extractXmlFromP7m,
  isP7mFile,
  isP7mContent,
  getInvoiceFileType,
} from '../p7m-utils'

describe('p7m-utils', () => {
  describe('isP7mFile', () => {
    it('should return true for .p7m files', () => {
      expect(isP7mFile('invoice.xml.p7m')).toBe(true)
      expect(isP7mFile('IT00178340261_094HV.xml.p7m')).toBe(true)
      expect(isP7mFile('TEST.P7M')).toBe(true)
    })

    it('should return false for non-p7m files', () => {
      expect(isP7mFile('invoice.xml')).toBe(false)
      expect(isP7mFile('document.pdf')).toBe(false)
      expect(isP7mFile('file.p7m.xml')).toBe(false)
    })
  })

  describe('getInvoiceFileType', () => {
    it('should identify xml files', () => {
      expect(getInvoiceFileType('invoice.xml')).toBe('xml')
      expect(getInvoiceFileType('INVOICE.XML')).toBe('xml')
    })

    it('should identify p7m files', () => {
      expect(getInvoiceFileType('invoice.xml.p7m')).toBe('p7m')
      expect(getInvoiceFileType('INVOICE.P7M')).toBe('p7m')
    })

    it('should return unknown for other files', () => {
      expect(getInvoiceFileType('invoice.pdf')).toBe('unknown')
      expect(getInvoiceFileType('invoice.txt')).toBe('unknown')
    })
  })

  describe('isP7mContent', () => {
    it('should identify P7M content by ASN.1 sequence tag', () => {
      // PKCS#7 content starts with 0x30 (SEQUENCE) and contains signed-data OID
      const p7mHeader = Buffer.from([
        0x30, 0x82, 0x10, 0x00, // SEQUENCE tag
        0x06, 0x09, // OID tag and length
        0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02, // signed-data OID
      ])
      expect(isP7mContent(p7mHeader)).toBe(true)
    })

    it('should return false for plain XML content', () => {
      const xmlContent = Buffer.from('<?xml version="1.0"?><root/>')
      expect(isP7mContent(xmlContent)).toBe(false)
    })

    it('should return false for empty buffer', () => {
      expect(isP7mContent(Buffer.from([]))).toBe(false)
    })
  })

  describe('extractXmlFromP7m', () => {
    it('should extract XML from simple embedded content', () => {
      // Create a mock P7M-like buffer with embedded XML
      const xmlContent = '<?xml version="1.0" encoding="UTF-8"?><p:FatturaElettronica xmlns:p="http://test"><Test>Value</Test></p:FatturaElettronica>'
      const mockP7m = Buffer.concat([
        Buffer.from([0x30, 0x82, 0x00, 0x00]), // Binary header
        Buffer.from(xmlContent),
        Buffer.from([0x00, 0x00]), // Binary footer
      ])

      const result = extractXmlFromP7m(mockP7m)
      expect(result).toContain('<?xml version="1.0"')
      expect(result).toContain('<p:FatturaElettronica')
      expect(result).toContain('</p:FatturaElettronica>')
    })

    it('should extract XML with various namespace prefixes', () => {
      const testCases = [
        { prefix: '', tag: 'FatturaElettronica' },
        { prefix: 'p:', tag: 'p:FatturaElettronica' },
        { prefix: 'ns0:', tag: 'ns0:FatturaElettronica' },
      ]

      for (const { prefix, tag } of testCases) {
        const xmlContent = `<?xml version="1.0"?><${tag} xmlns="${prefix}test"><Data/></${tag}>`
        const mockP7m = Buffer.concat([
          Buffer.from([0x30, 0x82]),
          Buffer.from(xmlContent),
          Buffer.from([0x00]),
        ])

        const result = extractXmlFromP7m(mockP7m)
        expect(result).toContain(`<${tag}`)
        expect(result).toContain(`</${tag}>`)
      }
    })

    it('should handle XML without declaration', () => {
      const xmlContent = '<FatturaElettronica><Body/></FatturaElettronica>'
      const mockP7m = Buffer.concat([
        Buffer.from([0x30, 0x82]),
        Buffer.from(xmlContent),
        Buffer.from([0x00]),
      ])

      const result = extractXmlFromP7m(mockP7m)
      expect(result).toContain('<FatturaElettronica>')
      expect(result).toContain('</FatturaElettronica>')
    })

    it('should clean null bytes from extracted XML', () => {
      const xmlContent = '<?xml version="1.0"?><p:FatturaElettronica>Test\0Value</p:FatturaElettronica>'
      const mockP7m = Buffer.from(xmlContent)

      const result = extractXmlFromP7m(mockP7m)
      expect(result).not.toContain('\0')
    })

    it('should throw error when XML cannot be extracted', () => {
      const invalidContent = Buffer.from([0x00, 0x01, 0x02, 0x03])

      expect(() => extractXmlFromP7m(invalidContent)).toThrow(
        'Impossibile estrarre il contenuto XML dal file P7M'
      )
    })

    it('should handle ArrayBuffer input', () => {
      const xmlContent = '<?xml version="1.0"?><p:FatturaElettronica><Test/></p:FatturaElettronica>'
      const arrayBuffer = new TextEncoder().encode(xmlContent).buffer

      const result = extractXmlFromP7m(arrayBuffer)
      expect(result).toContain('<p:FatturaElettronica>')
    })

    it('should extract real-world FatturaPA structure', () => {
      const realWorldXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">
<FatturaElettronicaHeader>
<DatiTrasmissione>
<IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>00000000000</IdCodice></IdTrasmittente>
</DatiTrasmissione>
</FatturaElettronicaHeader>
<FatturaElettronicaBody>
<DatiGenerali>
<DatiGeneraliDocumento>
<TipoDocumento>TD01</TipoDocumento>
<Divisa>EUR</Divisa>
<Data>2025-01-01</Data>
<Numero>1</Numero>
</DatiGeneraliDocumento>
</DatiGenerali>
</FatturaElettronicaBody>
</p:FatturaElettronica>`

      // Simulate P7M wrapper with binary header/footer
      const binaryHeader = Buffer.from([
        0x30, 0x82, 0x24, 0x7a, // ASN.1 SEQUENCE
        0x06, 0x09, // OID tag
        0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02, // signed-data OID
      ])
      const binaryFooter = Buffer.from([0x00, 0x00, 0x00])

      const mockP7m = Buffer.concat([
        binaryHeader,
        Buffer.from(realWorldXml),
        binaryFooter,
      ])

      const result = extractXmlFromP7m(mockP7m)

      expect(result).toContain('<?xml version="1.0"')
      expect(result).toContain('<p:FatturaElettronica')
      expect(result).toContain('FatturaElettronicaHeader')
      expect(result).toContain('FatturaElettronicaBody')
      expect(result).toContain('</p:FatturaElettronica>')
    })

    it('should preserve XML attributes and namespaces', () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?><p:FatturaElettronica xmlns:p="http://test" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" versione="FPR12"><Data attr="value"/></p:FatturaElettronica>`
      const mockP7m = Buffer.from(xmlContent)

      const result = extractXmlFromP7m(mockP7m)
      expect(result).toContain('xmlns:p="http://test"')
      expect(result).toContain('versione="FPR12"')
    })
  })
})
