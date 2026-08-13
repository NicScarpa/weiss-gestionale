import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
// `vi.mock` viene issato sopra gli import: quando questo modulo carica la
// route, il servizio delle scadenze è già quello sostituito qui sotto.
import { POST, GET } from '../route'

/**
 * Idempotenza e atomicità dell'import di una fattura elettronica.
 *
 * Due difetti distinti, entrambi dovuti al fatto che l'import non era una sola
 * operazione:
 *
 *  1. il controllo "esiste già?" e la creazione erano due comandi separati, con
 *     un intervallo in mezzo: due upload dello stesso XML (doppio click, retry
 *     dopo un timeout) passavano entrambi il controllo e importavano la fattura
 *     due volte — costo raddoppiato a bilancio e debito raddoppiato nello
 *     scadenzario;
 *  2. le scadenze si generavano dopo, fuori transazione, e il loro errore
 *     veniva solo scritto a log: la fattura restava a database senza scadenze,
 *     e il re-import rispondeva "già importata" senza modo di rimediare.
 *
 * I test qui misurano lo stato del database dopo la chiamata, non il messaggio
 * di risposta: è il numero di fatture a dover restare uno.
 */

/**
 * Interruttore per far fallire la generazione delle scadenze. Sta in
 * `vi.hoisted` perché la factory di `vi.mock` viene issata sopra a tutto: una
 * variabile normale non sarebbe ancora inizializzata quando la factory viene
 * valutata.
 */
const scadenze = vi.hoisted(() => ({ falliscono: false }))

vi.mock('@/lib/services/invoice-schedule-service', async (importOriginal) => {
  const reale = await importOriginal<
    typeof import('@/lib/services/invoice-schedule-service')
  >()

  return {
    ...reale,
    generateSchedulesFromInvoice: async (
      ...args: Parameters<typeof reale.generateSchedulesFromInvoice>
    ) => {
      if (scadenze.falliscono) {
        throw new Error('Generazione scadenze fallita (simulata dal test)')
      }
      return reale.generateSchedulesFromInvoice(...args)
    },
  }
})

setupIntegrationDb()

const NUMERO = '2026/0042'
const DATA = '2026-06-01'
const PIVA = '01234567890'

interface OpzioniXml {
  numero?: string
  data?: string
  piva?: string
  /** Rate del documento: una riga DettaglioPagamento ciascuna. */
  rate?: Array<{ scadenza: string; importo: string }>
  /** TD01 di default; TD04/TD05/TD08/TD09 per le note (Task 6). */
  tipoDocumento?: string
  /** `DatiFattureCollegate`: il riferimento della nota alla fattura rettificata. */
  fattureCollegate?: Array<{ idDocumento: string; data?: string }>
}

/**
 * XML FatturaPA minimo ma completo: header, cedente con P.IVA, corpo con
 * riepilogo IVA e dati di pagamento. Il parser rifiuta i documenti privi di
 * numero, data o partita IVA, quindi questi campi ci sono tutti.
 */
function xmlFattura(opzioni: OpzioniXml = {}): string {
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
        <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
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

async function importa<T = Record<string, unknown>>(xml: string) {
  const venue = await venueDiTest()

  return callRoute<T>(
    POST,
    jsonRequest('/api/invoices', {
      method: 'POST',
      body: { xmlContent: xml, fileName: 'fattura.xml', venueId: venue.id },
    })
  )
}

beforeEach(() => {
  scadenze.falliscono = false
  // La categorizzazione AI delle righe è un effetto collaterale dell'import:
  // senza chiave viene saltata, ed è l'unico modo di non chiamare l'API vera.
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})

describe('POST /api/invoices — idempotenza', () => {
  it(
    'due import concorrenti dello stesso XML lasciano una sola fattura',
    { repeats: 5 },
    async () => {
      await loginAs('admin')
      const xml = xmlFattura()

      const [primo, secondo] = await Promise.all([importa(xml), importa(xml)])

      const fatture = await prisma.electronicInvoice.findMany({
        where: { invoiceNumber: NUMERO },
      })
      expect(fatture).toHaveLength(1)

      // Una delle due chiamate ha importato, l'altra deve dire che c'era già:
      // un 500 significherebbe che il duplicato è stato fermato dal database
      // senza che la route sapesse spiegarlo a chi ha premuto due volte.
      const stati = [primo.status, secondo.status].sort()
      expect(stati).toEqual([201, 409])
    }
  )

  it('il secondo import risponde 409 indicando la fattura già presente', async () => {
    await loginAs('admin')
    const xml = xmlFattura()

    const primo = await importa<{ id: string }>(xml)
    const secondo = await importa<{ error: string; existingId: string }>(xml)

    expect(primo.status).toBe(201)
    expect(secondo.status).toBe(409)
    expect(secondo.body.existingId).toBe(primo.body.id)
  })

  it(
    'non duplica le scadenze dello scadenzario sul secondo import',
    { repeats: 5 },
    async () => {
      await loginAs('admin')
      const xml = xmlFattura({ rate: [
        { scadenza: '2026-07-01', importo: '61.00' },
        { scadenza: '2026-08-01', importo: '61.00' },
      ] })

      await Promise.all([importa(xml), importa(xml)])

      const scadenzeCreate = await prisma.schedule.findMany({
        where: { numeroDocumento: NUMERO },
      })
      expect(scadenzeCreate).toHaveLength(2)
    }
  )
})

describe('POST /api/invoices — atomicità', () => {
  it('non lascia la fattura a database se le scadenze falliscono', async () => {
    await loginAs('admin')
    scadenze.falliscono = true

    const risposta = await importa(xmlFattura())

    expect(risposta.status).toBe(500)
    expect(await prisma.electronicInvoice.count()).toBe(0)
    expect(await prisma.invoiceDeadline.count()).toBe(0)
    expect(await prisma.schedule.count()).toBe(0)
  })

  it('permette di ritentare l\'import dopo un fallimento delle scadenze', async () => {
    await loginAs('admin')
    const xml = xmlFattura()

    scadenze.falliscono = true
    await importa(xml)

    scadenze.falliscono = false
    const ritentato = await importa(xml)

    expect(ritentato.status).toBe(201)
    expect(await prisma.electronicInvoice.count()).toBe(1)
    expect(await prisma.schedule.count()).toBe(1)
  })

  it('importa fattura, rate e scadenze quando tutto va a buon fine', async () => {
    await loginAs('admin')

    const risposta = await importa<{ id: string; scadenzeGenerate: number }>(
      xmlFattura({ rate: [
        { scadenza: '2026-07-01', importo: '61.00' },
        { scadenza: '2026-08-01', importo: '61.00' },
      ] })
    )

    expect(risposta.status).toBe(201)
    expect(risposta.body.scadenzeGenerate).toBe(2)
    expect(await prisma.invoiceDeadline.count()).toBe(2)
    expect(await prisma.schedule.count()).toBe(2)
  })
})

/**
 * Task 6, round 2 (Important 3 e 4): la risoluzione di `rettificaInvoiceId`
 * all'import di una nota di credito non aveva alcun test — le tre falle del
 * round 1 (nota di debito sottratta, pagamento pieno, collegamento senza
 * data) sono passate tutte da qui.
 */
describe('POST /api/invoices — nota di credito: risoluzione del collegamento (Task 6)', () => {
  it('TD04 che referenzia una fattura esistente: rettificaInvoiceId si valorizza', async () => {
    await loginAs('admin')

    const fattura = await importa<{ id: string }>(xmlFattura())
    expect(fattura.status).toBe(201)

    const nota = await importa<{ id: string }>(
      xmlFattura({
        numero: 'NC-0001',
        tipoDocumento: 'TD04',
        fattureCollegate: [{ idDocumento: NUMERO, data: DATA }],
      })
    )
    expect(nota.status).toBe(201)

    const notaDb = await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: nota.body.id } })
    expect(notaDb.rettificaInvoiceId).toBe(fattura.body.id)
  })

  it('TD04 che referenzia un numero sconosciuto: resta null, l\'import risponde comunque 201', async () => {
    await loginAs('admin')

    const nota = await importa<{ id: string }>(
      xmlFattura({
        numero: 'NC-0002',
        tipoDocumento: 'TD04',
        fattureCollegate: [{ idDocumento: '9999/9999', data: '2020-01-01' }],
      })
    )

    expect(nota.status).toBe(201)
    const notaDb = await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: nota.body.id } })
    expect(notaDb.rettificaInvoiceId).toBeNull()
  })

  it('due fatture con lo stesso numero (rinumerazione annuale): la data nel riferimento sceglie quella giusta', async () => {
    // Lo stesso fornitore, lo stesso numero "1" in due anni diversi — la
    // norma, non un caso limite. Senza la data la query prenderebbe una
    // fattura arbitraria; con la data presente nell'XML deve prendere
    // esattamente quella referenziata, mai l'altra.
    await loginAs('admin')

    const vecchia = await importa<{ id: string }>(
      xmlFattura({ numero: '1', data: '2025-03-10' })
    )
    const nuova = await importa<{ id: string }>(
      xmlFattura({ numero: '1', data: '2026-03-10' })
    )
    expect(vecchia.status).toBe(201)
    expect(nuova.status).toBe(201)

    const nota = await importa<{ id: string }>(
      xmlFattura({
        numero: 'NC-0003',
        tipoDocumento: 'TD04',
        fattureCollegate: [{ idDocumento: '1', data: '2025-03-10' }],
      })
    )
    expect(nota.status).toBe(201)

    const notaDb = await prisma.electronicInvoice.findUniqueOrThrow({ where: { id: nota.body.id } })
    expect(notaDb.rettificaInvoiceId).toBe(vecchia.body.id)
    expect(notaDb.rettificaInvoiceId).not.toBe(nuova.body.id)
  })
})

describe('GET /api/invoices — ordinamento', () => {
  it('rifiuta un campo di ordinamento fuori dalla whitelist', async () => {
    await loginAs('admin')

    const risposta = await callRoute(
      GET,
      jsonRequest('/api/invoices', { searchParams: { sortBy: 'xmlContent' } })
    )

    expect(risposta.status).toBe(400)
  })

  it('rifiuta un verso di ordinamento non valido invece di andare in errore', async () => {
    await loginAs('admin')

    const risposta = await callRoute(
      GET,
      jsonRequest('/api/invoices', { searchParams: { sortOrder: 'pippo' } })
    )

    expect(risposta.status).toBe(400)
  })
})
