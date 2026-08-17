/**
 * Generatore di XML FatturaPA per i test. Estratto da
 * `import-idempotente.itest.ts`, dove viveva come funzione locale: serviva
 * identico anche altrove (ritenuta d'acconto, note di credito) e sarebbe
 * diventata la terza copia in giro — `righe-conti/__tests__/route.itest.ts`
 * ne ha già una sua, più piccola e specializzata sulle righe.
 */

export interface OpzioniXml {
  numero?: string
  data?: string
  piva?: string
  /** Rate del documento: una riga DettaglioPagamento ciascuna. */
  rate?: Array<{ scadenza: string; importo: string }>
  /** TD01 di default; TD04/TD05/TD08/TD09 per le note. */
  tipoDocumento?: string
  /** `DatiFattureCollegate`: il riferimento della nota alla fattura rettificata. */
  fattureCollegate?: Array<{ idDocumento: string; data?: string }>
  /**
   * DatiRitenuta nel documento: assente se non specificato. Un array genera
   * più nodi `<DatiRitenuta>` fratelli (le parcelle possono averne due,
   * erariale e previdenziale insieme) — utile per verificare che il parser
   * ne prenda solo il primo, come dichiara il suo commento.
   */
  ritenuta?: RitenutaXml | RitenutaXml[]
}

interface RitenutaXml {
  tipo: string
  importo: string
  aliquota: string
  causale?: string
}

const NUMERO = '2026/0042'
const DATA = '2026-06-01'
const PIVA = '01234567890'

/**
 * XML FatturaPA minimo ma completo: header, cedente con P.IVA, corpo con
 * riepilogo IVA e dati di pagamento. Il parser rifiuta i documenti privi di
 * numero, data o partita IVA, quindi questi campi ci sono tutti.
 */
export function xmlFattura(opzioni: OpzioniXml = {}): string {
  const numero = opzioni.numero ?? NUMERO
  const data = opzioni.data ?? DATA
  const piva = opzioni.piva ?? PIVA
  const rate = opzioni.rate ?? [{ scadenza: '2026-07-01', importo: '122.00' }]
  const tipoDocumento = opzioni.tipoDocumento ?? 'TD01'

  const dettagliPagamento = rate
    .map(
      (rata) => `
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>${rata.scadenza}</DataScadenzaPagamento>
        <ImportoPagamento>${rata.importo}</ImportoPagamento>
      </DettaglioPagamento>`
    )
    .join('')

  const datiFattureCollegate = (opzioni.fattureCollegate ?? [])
    .map(
      (rif) => `
      <DatiFattureCollegate>
        <IdDocumento>${rif.idDocumento}</IdDocumento>${rif.data ? `\n        <Data>${rif.data}</Data>` : ''}
      </DatiFattureCollegate>`
    )
    .join('')

  const ritenute = opzioni.ritenuta
    ? Array.isArray(opzioni.ritenuta)
      ? opzioni.ritenuta
      : [opzioni.ritenuta]
    : []
  const datiRitenuta = ritenute
    .map(
      (r) =>
        `<DatiRitenuta><TipoRitenuta>${r.tipo}</TipoRitenuta><ImportoRitenuta>${r.importo}</ImportoRitenuta><AliquotaRitenuta>${r.aliquota}</AliquotaRitenuta>${r.causale ? `<CausalePagamento>${r.causale}</CausalePagamento>` : ''}</DatiRitenuta>`
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${piva}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>00001</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>0000000</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${piva}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Torrefazione di prova Srl</Denominazione></Anagrafica>
        <RegimeFiscale>RF01</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>Via del Caffe 1</Indirizzo>
        <CAP>39100</CAP>
        <Comune>Bolzano</Comune>
        <Provincia>BZ</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>09876543210</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Weiss Cafe</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>Piazza Grande 2</Indirizzo>
        <CAP>39100</CAP>
        <Comune>Bolzano</Comune>
        <Provincia>BZ</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDocumento}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${data}</Data>
        <Numero>${numero}</Numero>
        <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>${datiRitenuta}
      </DatiGeneraliDocumento>${datiFattureCollegate}
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Caffe in grani 1 kg</Descrizione>
        <Quantita>10.00</Quantita>
        <UnitaMisura>KG</UnitaMisura>
        <PrezzoUnitario>10.00</PrezzoUnitario>
        <PrezzoTotale>100.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>100.00</ImponibileImporto>
        <Imposta>22.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>${dettagliPagamento}
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`
}
