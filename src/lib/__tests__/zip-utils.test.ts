import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { extractInvoicesFromZip, isFileMetadatoAdE, isInvoiceFile } from '../zip-utils'

async function creaZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [nome, contenuto] of Object.entries(files)) zip.file(nome, contenuto)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('isFileMetadatoAdE', () => {
  it('riconosce il metadato dell Agenzia in tutte le grafie', () => {
    expect(isFileMetadatoAdE('IT01234567890_00001_metaDato.xml')).toBe(true)
    expect(isFileMetadatoAdE('IT01234567890_00001_METADATO.XML')).toBe(true)
    expect(isFileMetadatoAdE('IT01234567890_00001_metadato.xml')).toBe(true)
  })

  it('non scambia per metadato una fattura vera', () => {
    expect(isFileMetadatoAdE('IT01234567890_019IC.xml')).toBe(false)
    expect(isFileMetadatoAdE('SM03473_GR1Qa.xml.p7m')).toBe(false)
  })
})

describe('extractInvoicesFromZip', () => {
  it('scarta i metadati e li conta a parte', async () => {
    const buffer = await creaZip({
      'IT01234567890_00001.xml': '<FatturaElettronica/>',
      'IT01234567890_00001_metaDato.xml': '<metadati/>',
      'IT01234567890_00002.xml': '<FatturaElettronica/>',
      'IT01234567890_00002_metaDato.xml': '<metadati/>',
    })

    const risultato = await extractInvoicesFromZip(buffer, 'zippone.zip')

    expect(risultato.success).toBe(true)
    expect(risultato.files.map((f) => f.name)).toEqual([
      'IT01234567890_00001.xml',
      'IT01234567890_00002.xml',
    ])
    expect(risultato.stats.metadataFiles).toBe(2)
    expect(risultato.stats.invoiceFiles).toBe(2)
    expect(risultato.errors).toHaveLength(0)
  })

  it('accetta le estensioni in maiuscolo', async () => {
    const buffer = await creaZip({ 'IT02634040246_226C8.XML.P7M': 'contenuto' })
    const risultato = await extractInvoicesFromZip(buffer, 'archivio.zip')
    expect(risultato.files).toHaveLength(1)
    expect(isInvoiceFile('IT02634040246_226C8.XML.P7M')).toBe(true)
  })
})
