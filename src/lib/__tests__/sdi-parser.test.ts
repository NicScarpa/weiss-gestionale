import { describe, it, expect } from 'vitest'
import { parseFatturaPA, calcolaImporti } from '../sdi/parser'

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
})
