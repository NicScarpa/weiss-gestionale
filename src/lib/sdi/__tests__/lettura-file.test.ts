// jsdom (l'ambiente di default per i test) ha un File/Blob che non implementa
// .text() né .arrayBuffer(): leggiFileFattura ne dipende per leggere il
// contenuto dei file scelti dall'utente. Il modulo non tocca il DOM, quindi
// gira in ambiente Node, dove File li implementa davvero.
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { xmlFattura } from '@/test/factories/fattura-xml.factory'
import { leggiFileFattura } from '../lettura-file'

// Stesso generatore degli itest, estratto nel Task 3: un solo FatturaPA di
// prova in tutto il progetto, non uno per file di test.
const XML_MINIMO = xmlFattura({ numero: '42', data: '2026-06-01', piva: '07945211006' })

function fileDaTesto(nome: string, testo: string): File {
  return new File([new Blob([testo])], nome, { type: 'application/xml' })
}

describe('leggiFileFattura', () => {
  it('legge un XML sciolto', async () => {
    const esito = await leggiFileFattura([fileDaTesto('IT07945211006_001.xml', XML_MINIMO)])

    expect(esito.fatture).toHaveLength(1)
    expect(esito.fatture[0]).toMatchObject({
      chiave: 'IT07945211006_001.xml',
      numero: '42',
      data: '2026-06-01',
      tipoDocumento: 'TD01',
      denominazioneFornitore: 'Torrefazione di prova Srl',
      partitaIvaFornitore: '07945211006',
      totalAmount: 122,
      netAmount: 100,
      vatAmount: 22,
      primaScadenza: '2026-07-01',
      scadenzaStimata: false,
      giorniDalFile: 30,
      daZip: null,
      ritenuta: null,
    })
    expect(esito.fatture[0].aliquote).toEqual([22])
  })

  it('spacchetta uno ZIP e ricorda da dove viene ogni fattura', async () => {
    const zip = new JSZip()
    zip.file('cartella/IT07945211006_001.xml', XML_MINIMO)
    zip.file('cartella/IT07945211006_001_metaDato.xml', '<metadati/>')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const fileZip = new File([new Blob([buffer])], 'agosto.zip', { type: 'application/zip' })

    const esito = await leggiFileFattura([fileZip])

    expect(esito.fatture).toHaveLength(1)
    expect(esito.fatture[0].daZip).toBe('agosto.zip')
    expect(esito.metadatiIgnorati).toBe(1)
  })

  it('mette fra gli scartati il file che non si riesce a leggere', async () => {
    const esito = await leggiFileFattura([fileDaTesto('rotto.xml', '<non-una-fattura/>')])
    expect(esito.fatture).toHaveLength(0)
    expect(esito.scartati).toHaveLength(1)
    expect(esito.scartati[0].nomeFile).toBe('rotto.xml')
    expect(esito.scartati[0].motivo).toBeTruthy()
  })

  it('mostra in negativo una nota di credito, senza toccare l XML', async () => {
    const notaCredito = XML_MINIMO.replace('<TipoDocumento>TD01<', '<TipoDocumento>TD04<')
    const esito = await leggiFileFattura([fileDaTesto('nota.xml', notaCredito)])

    expect(esito.fatture[0].totalAmount).toBe(-122)
    expect(esito.fatture[0].netAmount).toBe(-100)
    expect(esito.fatture[0].vatAmount).toBe(-22)
    // L'XML che andrà al server resta quello originale, intatto
    expect(esito.fatture[0].xmlContent).toContain('<ImportoTotaleDocumento>122.00<')
  })

  it('marca come stimata la scadenza che l XML non porta', async () => {
    const senzaScadenza = XML_MINIMO.replace(
      '<DataScadenzaPagamento>2026-07-01</DataScadenzaPagamento>',
      ''
    )
    const esito = await leggiFileFattura([fileDaTesto('senza.xml', senzaScadenza)])
    expect(esito.fatture[0].scadenzaStimata).toBe(true)
    expect(esito.fatture[0].giorniDalFile).toBeNull()
  })
})
