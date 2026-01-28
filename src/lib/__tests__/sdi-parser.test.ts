import { describe, it, expect } from 'vitest'
import { parseFatturaPA, calcolaImporti, estraiScadenze, parseFatturaPASafe } from '../sdi/parser'
import { TIPI_DOCUMENTO, MODALITA_PAGAMENTO, NATURA_OPERAZIONE } from '../sdi/types'

describe('sdi/parser - parseFatturaPA', () => {
  describe('Normalizzazione Partita IVA', () => {
    it('preserva P.IVA con zero iniziale (00713150266)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>00713150266</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Test SRL</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Cliente SRL</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-01</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>100.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>81.97</ImponibileImporto>
        <Imposta>18.03</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.cedentePrestatore.partitaIva).toBe('00713150266')
      expect(result.cedentePrestatore.partitaIva.length).toBe(11)
    })

    it('normalizza P.IVA senza zero iniziale a 11 cifre', () => {
      // Simula il caso in cui il parser abbia già convertito il numero
      // Questo test verifica che la funzione di normalizzazione funzioni
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>713150266</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Test SRL</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Cliente</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-01</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      // Dovrebbe essere normalizzata a 11 cifre con padding
      expect(result.cedentePrestatore.partitaIva).toBe('00713150266')
      expect(result.cedentePrestatore.partitaIva.length).toBe(11)
    })

    it('rimuove prefisso IT dalla P.IVA', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>IT01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Test SRL</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Cliente</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-01</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.cedentePrestatore.partitaIva).toBe('01234567890')
      expect(result.cedentePrestatore.partitaIva).not.toContain('IT')
    })

    it('preserva P.IVA standard 11 cifre', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>12345678901</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Test SRL</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Cliente</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-01</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.cedentePrestatore.partitaIva).toBe('12345678901')
      expect(result.cedentePrestatore.partitaIva.length).toBe(11)
    })
  })

  describe('Estrazione Denominazione', () => {
    it('estrae correttamente la denominazione (ragione sociale)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>D.M.C. srl</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Cliente</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-01</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.cedentePrestatore.denominazione).toBe('D.M.C. srl')
    })

    it('gestisce persone fisiche (Nome + Cognome)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Nome>Mario</Nome>
          <Cognome>Rossi</Cognome>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Cliente</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-01</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.cedentePrestatore.denominazione).toBe('Mario Rossi')
    })
  })

  describe('Calcolo Importi', () => {
    it('calcola correttamente totale, imponibile e IVA', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Test</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01234567890</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Cliente</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-01</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>482.85</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>10.00</AliquotaIVA>
        <ImponibileImporto>39.00</ImponibileImporto>
        <Imposta>3.90</Imposta>
      </DatiRiepilogo>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>360.00</ImponibileImporto>
        <Imposta>79.20</Imposta>
      </DatiRiepilogo>
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <ImponibileImporto>0.75</ImponibileImporto>
        <Imposta>0.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      const importi = calcolaImporti(result)

      expect(importi.totalAmount).toBe(482.85)
      expect(importi.netAmount).toBeCloseTo(399.75, 2) // 39 + 360 + 0.75
      expect(importi.vatAmount).toBeCloseTo(83.10, 2) // 3.90 + 79.20 + 0
    })
  })

  describe('Namespace XML', () => {
    it('gestisce namespace p: correttamente', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>00713150266</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>D.M.C. srl</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>01723900930</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>WEISS SRL</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD24</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-12-23</Data>
        <Numero>9621/U01</Numero>
        <ImportoTotaleDocumento>482.85</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>360.00</ImponibileImporto>
        <Imposta>79.20</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.cedentePrestatore.partitaIva).toBe('00713150266')
      expect(result.cedentePrestatore.denominazione).toBe('D.M.C. srl')
      expect(result.numero).toBe('9621/U01')
      expect(result.tipoDocumento).toBe('TD24')
    })
  })

  describe('FatturaPA Compliance - Tipi Documento', () => {
    // Helper per creare XML di test con tipo documento variabile
    const createXmlWithTipoDocumento = (tipoDoc: string) => `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Fornitore SRL</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDoc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>TEST-001</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

    it.each([
      ['TD01', 'Fattura'],
      ['TD02', 'Acconto/Anticipo su fattura'],
      ['TD04', 'Nota di Credito'],
      ['TD05', 'Nota di Debito'],
      ['TD06', 'Parcella'],
      ['TD24', 'Fattura differita'],
    ])('riconosce TipoDocumento %s', (tipoDoc) => {
      const xml = createXmlWithTipoDocumento(tipoDoc)
      const result = parseFatturaPA(xml)
      expect(result.tipoDocumento).toBe(tipoDoc)
      expect(TIPI_DOCUMENTO[tipoDoc]).toBeDefined()
    })
  })

  describe('FatturaPA Compliance - Natura Operazione', () => {
    it('estrae correttamente Natura per aliquota IVA 0%', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <Natura>N4</Natura>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.datiRiepilogo[0].natura).toBe('N4')
      expect(NATURA_OPERAZIONE['N4']).toBe('Esenti')
    })
  })

  describe('FatturaPA Compliance - Pagamenti', () => {
    it('estrae modalità pagamento e scadenze', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>2025-02-09</DataScadenzaPagamento>
        <ImportoPagamento>122.00</ImportoPagamento>
        <IBAN>IT60X0542811101000000123456</IBAN>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.datiPagamento).toBeDefined()
      expect(result.datiPagamento?.condizioniPagamento).toBe('TP02')
      expect(result.datiPagamento?.dettagliPagamento[0].modalitaPagamento).toBe('MP05')
      expect(MODALITA_PAGAMENTO['MP05']).toBe('Bonifico')
      expect(result.datiPagamento?.dettagliPagamento[0].iban).toBe('IT60X0542811101000000123456')

      const scadenze = estraiScadenze(result)
      expect(scadenze.length).toBe(1)
      expect(scadenze[0].amount).toBe(122.00)
      expect(scadenze[0].paymentMethod).toBe('MP05')
    })

    it('gestisce pagamenti multipli (rate)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>300.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>245.90</ImponibileImporto>
        <Imposta>54.10</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP01</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>2025-02-09</DataScadenzaPagamento>
        <ImportoPagamento>100.00</ImportoPagamento>
      </DettaglioPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>2025-03-09</DataScadenzaPagamento>
        <ImportoPagamento>100.00</ImportoPagamento>
      </DettaglioPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>2025-04-09</DataScadenzaPagamento>
        <ImportoPagamento>100.00</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.datiPagamento?.condizioniPagamento).toBe('TP01') // a rate
      expect(result.datiPagamento?.dettagliPagamento.length).toBe(3)

      const scadenze = estraiScadenze(result)
      expect(scadenze.length).toBe(3)
      expect(scadenze.reduce((sum, s) => sum + s.amount, 0)).toBe(300.00)
    })
  })

  describe('FatturaPA Compliance - Formati Data e Importi', () => {
    it('parsa correttamente formato data YYYY-MM-DD', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.data).toBe('2025-01-09')
      // Verifica che sia una data ISO valida
      const date = new Date(result.data)
      expect(date.getFullYear()).toBe(2025)
      expect(date.getMonth()).toBe(0) // Gennaio = 0
      expect(date.getDate()).toBe(9)
    })

    it('parsa importi decimali con punto (standard FatturaPA)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>1234.56</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Prodotto test</Descrizione>
        <Quantita>10.50</Quantita>
        <UnitaMisura>PZ</UnitaMisura>
        <PrezzoUnitario>95.85</PrezzoUnitario>
        <PrezzoTotale>1006.42</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>1006.42</ImponibileImporto>
        <Imposta>221.41</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.importoTotaleDocumento).toBe(1234.56)
      expect(result.dettaglioLinee[0].quantita).toBe(10.50)
      expect(result.dettaglioLinee[0].prezzoUnitario).toBe(95.85)
      expect(result.dettaglioLinee[0].prezzoTotale).toBe(1006.42)
    })
  })

  describe('FatturaPA Compliance - Causale', () => {
    it('gestisce causale singola', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <Causale>Vendita merce periodo Gennaio 2025</Causale>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.causale).toBeDefined()
      expect(result.causale?.length).toBe(1)
      expect(result.causale?.[0]).toBe('Vendita merce periodo Gennaio 2025')
    })

    it('gestisce causale multipla (array)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <Causale>Prima riga causale</Causale>
        <Causale>Seconda riga causale</Causale>
        <Causale>Terza riga causale</Causale>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.causale).toBeDefined()
      expect(result.causale?.length).toBe(3)
      expect(result.causale?.[0]).toBe('Prima riga causale')
      expect(result.causale?.[2]).toBe('Terza riga causale')
    })
  })

  describe('FatturaPA Compliance - Bollo Virtuale', () => {
    it('estrae dati bollo virtuale', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <DatiBollo>
          <BolloVirtuale>SI</BolloVirtuale>
          <ImportoBollo>2.00</ImportoBollo>
        </DatiBollo>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>0.00</Imposta>
        <Natura>N4</Natura>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.datiBollo).toBeDefined()
      expect(result.datiBollo?.bolloVirtuale).toBe('SI')
      expect(result.datiBollo?.importoBollo).toBe(2.00)
    })
  })

  describe('FatturaPA Compliance - Dettaglio Linee', () => {
    it('parsa linee multiple con codice articolo', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <CodiceArticolo>
          <CodiceTipo>FORNITORE</CodiceTipo>
          <CodiceValore>ABC123</CodiceValore>
        </CodiceArticolo>
        <Descrizione>Prodotto A</Descrizione>
        <Quantita>10.00</Quantita>
        <UnitaMisura>PZ</UnitaMisura>
        <PrezzoUnitario>5.00</PrezzoUnitario>
        <PrezzoTotale>50.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DettaglioLinee>
        <NumeroLinea>2</NumeroLinea>
        <Descrizione>Prodotto B</Descrizione>
        <Quantita>5.00</Quantita>
        <UnitaMisura>KG</UnitaMisura>
        <PrezzoUnitario>20.00</PrezzoUnitario>
        <PrezzoTotale>100.00</PrezzoTotale>
        <AliquotaIVA>10.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>50.00</ImponibileImporto>
        <Imposta>11.00</Imposta>
      </DatiRiepilogo>
      <DatiRiepilogo>
        <AliquotaIVA>10.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>10.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPA(xml)
      expect(result.dettaglioLinee.length).toBe(2)
      expect(result.dettaglioLinee[0].numeroLinea).toBe(1)
      expect(result.dettaglioLinee[0].descrizione).toBe('Prodotto A')
      expect(result.dettaglioLinee[0].unitaMisura).toBe('PZ')
      expect(result.dettaglioLinee[1].numeroLinea).toBe(2)
      expect(result.dettaglioLinee[1].aliquotaIVA).toBe(10.00)

      // Verifica riepilogo IVA multiplo
      expect(result.datiRiepilogo.length).toBe(2)
      expect(result.datiRiepilogo[0].aliquotaIVA).toBe(22.00)
      expect(result.datiRiepilogo[1].aliquotaIVA).toBe(10.00)
    })
  })

  describe('FatturaPA Compliance - Validazione Base', () => {
    it('lancia errore se manca P.IVA fornitore', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      expect(() => parseFatturaPA(xml)).toThrow('Partita IVA o Codice Fiscale del fornitore non trovati')
    })

    it('lancia errore se manca numero fattura', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      expect(() => parseFatturaPA(xml)).toThrow('Numero fattura non trovato')
    })

    it('lancia errore se manca data fattura', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      expect(() => parseFatturaPA(xml)).toThrow('Data fattura non trovata')
    })
  })
})

describe('sdi/parser - parseFatturaPASafe', () => {
  describe('Error Handling Strutturato', () => {
    it('restituisce success=true con warnings per fattura valida', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test SRL</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Test</Descrizione>
        <PrezzoUnitario>100.00</PrezzoUnitario>
        <PrezzoTotale>100.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPASafe(xml)
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.errors).toHaveLength(0)
      expect(result.data?.numero).toBe('123')
    })

    it('restituisce success=false con errore per XML malformato', () => {
      const xml = `<FatturaElettronica><broken`

      const result = parseFatturaPASafe(xml)
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].code).toBe('INVALID_XML')
    })

    it('restituisce success=false con errore per root mancante', () => {
      const xml = `<?xml version="1.0"?><AltroDocumento></AltroDocumento>`

      const result = parseFatturaPASafe(xml)
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'MISSING_ROOT')).toBe(true)
    })

    it('restituisce success=false con errore per P.IVA mancante', () => {
      const xml = `<?xml version="1.0"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPASafe(xml)
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'MISSING_VAT')).toBe(true)
    })

    it('genera warning per tipo documento non riconosciuto', () => {
      const xml = `<?xml version="1.0"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD99</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>100.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>81.97</ImponibileImporto>
        <Imposta>18.03</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPASafe(xml)
      expect(result.success).toBe(true) // Parsing OK ma con warning
      expect(result.warnings.some((w) => w.code === 'UNKNOWN_DOCUMENT_TYPE')).toBe(true)
    })

    it('genera warning per linee dettaglio vuote', () => {
      const xml = `<?xml version="1.0"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
        <ImportoTotaleDocumento>100.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>81.97</ImponibileImporto>
        <Imposta>18.03</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPASafe(xml)
      expect(result.success).toBe(true)
      expect(result.warnings.some((w) => w.code === 'EMPTY_LINE_ITEMS')).toBe(true)
    })

    it('genera warning per importo totale mancante', () => {
      const xml = `<?xml version="1.0"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Test</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2025-01-09</Data>
        <Numero>123</Numero>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Prodotto</Descrizione>
        <PrezzoUnitario>100.00</PrezzoUnitario>
        <PrezzoTotale>100.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

      const result = parseFatturaPASafe(xml)
      expect(result.success).toBe(true)
      expect(result.warnings.some((w) => w.code === 'MISSING_TOTAL_AMOUNT')).toBe(true)
    })
  })
})
