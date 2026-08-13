import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { PATCH } from '../route'

/**
 * PATCH /api/invoices/[id]/righe-conti su database vero: qui si verifica
 * quello che i test unitari (Prisma mockato) non possono verificare — lo
 * stato REALE della tabella dopo la scrittura, non solo gli argomenti passati
 * a `upsert`/`deleteMany`.
 *
 * Il caso che conta di più: una richiesta che nomina un solo progressivo su
 * una riga che ne ha già un altro in database (revisione del Task 5, round 2)
 * deve sostituire la riga, non affiancarla. Senza la `deleteMany` in
 * route.ts, una riga da 100 € finirebbe con DUE imputazioni da 100 € — la
 * stessa somma raddoppiata, in silenzio.
 */
setupIntegrationDb()

/** XML FatturaPA minimo con le righe indicate, tutte imponibile + 22% IVA. */
function xmlFattura(righe: Array<{ numeroLinea: number; descrizione: string; importo: number }>): string {
  const dettaglioLinee = righe
    .map(
      (r) => `
      <DettaglioLinee>
        <NumeroLinea>${r.numeroLinea}</NumeroLinea>
        <Descrizione>${r.descrizione}</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>${r.importo.toFixed(2)}</PrezzoUnitario>
        <PrezzoTotale>${r.importo.toFixed(2)}</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>`
    )
    .join('')
  const imponibile = righe.reduce((s, r) => s + r.importo, 0)

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdTrasmittente>
      <ProgressivoInvio>00001</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>0000000</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Fornitore di prova Srl</Denominazione></Anagrafica>
        <RegimeFiscale>RF01</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>Via di prova 1</Indirizzo>
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
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2026-08-01</Data>
        <Numero>2026/${Math.floor(Math.random() * 100000)}</Numero>
        <ImportoTotaleDocumento>${(imponibile * 1.22).toFixed(2)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>${dettaglioLinee}
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>${imponibile.toFixed(2)}</ImponibileImporto>
        <Imposta>${(imponibile * 0.22).toFixed(2)}</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`
}

async function fatturaDiProva(righe: Array<{ numeroLinea: number; descrizione: string; importo: number }>) {
  const venue = await venueDiTest()
  const xmlContent = xmlFattura(righe)
  const imponibile = righe.reduce((s, r) => s + r.importo, 0)

  return prisma.electronicInvoice.create({
    data: {
      venueId: venue.id,
      invoiceNumber: `FT-${Math.random().toString(36).slice(2, 10)}`,
      invoiceDate: new Date('2026-08-01'),
      supplierVat: '01234567890',
      supplierName: 'Fornitore di prova',
      totalAmount: new Prisma.Decimal((imponibile * 1.22).toFixed(2)),
      netAmount: new Prisma.Decimal(imponibile.toFixed(2)),
      vatAmount: new Prisma.Decimal((imponibile * 0.22).toFixed(2)),
      status: 'IMPORTED',
      xmlContent,
    },
  })
}

let contoA: string
let contoB: string

beforeEach(async () => {
  const conti = await prisma.account.findMany({
    where: { isActive: true, type: 'COSTO' },
    select: { id: true },
    orderBy: { code: 'asc' },
    take: 2,
  })
  contoA = conti[0].id
  contoB = conti[1].id
})

async function quoteDiRiga(invoiceId: string, numeroLinea: number) {
  return prisma.invoiceLineAccount.findMany({
    where: { invoiceId, numeroLinea },
    orderBy: { progressivo: 'asc' },
  })
}

describe('PATCH righe-conti su database vero: la richiesta autorevole sulla riga', () => {
  it('una richiesta che nomina solo il progressivo 1 su una riga già confermata (progressivo 0) sostituisce la riga, non la raddoppia', async () => {
    const fattura = await fatturaDiProva([{ numeroLinea: 1, descrizione: 'Detersivi', importo: 100 }])
    await loginAs('admin')

    const prima = await callRoute(
      PATCH,
      jsonRequest(`/api/invoices/${fattura.id}/righe-conti`, {
        method: 'PATCH',
        body: { righe: [{ numeroLinea: 1, accountId: contoA }] },
      }),
      { id: fattura.id }
    )
    expect(prima.status).toBe(200)

    const dopoPrima = await quoteDiRiga(fattura.id, 1)
    expect(dopoPrima).toHaveLength(1)
    expect(dopoPrima[0].progressivo).toBe(0)
    expect(Number(dopoPrima[0].importo)).toBe(100)

    // La seconda richiesta nomina SOLO il progressivo 1, mai il progressivo 0
    // già in database.
    const seconda = await callRoute(
      PATCH,
      jsonRequest(`/api/invoices/${fattura.id}/righe-conti`, {
        method: 'PATCH',
        body: { righe: [{ numeroLinea: 1, progressivo: 1, accountId: contoB }] },
      }),
      { id: fattura.id }
    )
    expect(seconda.status).toBe(200)

    const dopoSeconda = await quoteDiRiga(fattura.id, 1)
    expect(dopoSeconda).toHaveLength(1)
    expect(dopoSeconda[0].progressivo).toBe(1)
    expect(dopoSeconda[0].accountId).toBe(contoB)
    // L'importo pieno, non uno frammento: era una riga intera anche prima,
    // la seconda richiesta la conferma di nuovo intera, solo su un altro conto.
    expect(Number(dopoSeconda[0].importo)).toBe(100)
  })

  it('la deleteMany di una riga non tocca le altre righe della stessa fattura', async () => {
    const fattura = await fatturaDiProva([
      { numeroLinea: 1, descrizione: 'Detersivi', importo: 100 },
      { numeroLinea: 2, descrizione: 'Farina', importo: 50 },
    ])
    await loginAs('admin')

    await callRoute(
      PATCH,
      jsonRequest(`/api/invoices/${fattura.id}/righe-conti`, {
        method: 'PATCH',
        body: {
          righe: [
            { numeroLinea: 1, accountId: contoA },
            { numeroLinea: 2, accountId: contoB },
          ],
        },
      }),
      { id: fattura.id }
    )

    const rigaDueOriginale = await quoteDiRiga(fattura.id, 2)
    expect(rigaDueOriginale).toHaveLength(1)
    const idOriginale = rigaDueOriginale[0].id

    // Riconferma SOLO la riga 1 su un altro progressivo: la riga 2 non deve
    // muoversi di un millimetro.
    const risposta = await callRoute(
      PATCH,
      jsonRequest(`/api/invoices/${fattura.id}/righe-conti`, {
        method: 'PATCH',
        body: { righe: [{ numeroLinea: 1, progressivo: 5, accountId: contoB }] },
      }),
      { id: fattura.id }
    )
    expect(risposta.status).toBe(200)

    const rigaDueDopo = await quoteDiRiga(fattura.id, 2)
    expect(rigaDueDopo).toHaveLength(1)
    expect(rigaDueDopo[0].id).toBe(idOriginale)
    expect(rigaDueDopo[0].accountId).toBe(contoB)
  })

  it('righe (con deleteMany) e confermaTutte nella stessa richiesta: nessun conflitto, ciascuna riga viene gestita dal proprio percorso', async () => {
    const fattura = await fatturaDiProva([
      { numeroLinea: 1, descrizione: 'Detersivi', importo: 100 },
      { numeroLinea: 2, descrizione: 'Farina', importo: 50 },
    ])
    // Riga 2 simula una proposta non ancora confermata (es. dalla memoria
    // fornitore-prodotto o dall'AI): stato 'proposta', progressivo 0.
    await prisma.invoiceLineAccount.create({
      data: {
        invoiceId: fattura.id,
        numeroLinea: 2,
        progressivo: 0,
        descrizione: 'Farina',
        importo: new Prisma.Decimal(50),
        accountId: contoB,
        stato: 'proposta',
        fonte: 'ai',
      },
    })
    await loginAs('admin')

    const risposta = await callRoute(
      PATCH,
      jsonRequest(`/api/invoices/${fattura.id}/righe-conti`, {
        method: 'PATCH',
        body: {
          righe: [{ numeroLinea: 1, accountId: contoA }],
          confermaTutte: true,
        },
      }),
      { id: fattura.id }
    )

    expect(risposta.status).toBe(200)
    // La riga 1, gestita dal percorso `righe`, è confermata normalmente.
    const rigaUno = await quoteDiRiga(fattura.id, 1)
    expect(rigaUno).toHaveLength(1)
    expect(rigaUno[0].stato).toBe('confermata')
    // La riga 2, non nominata da `righe`, non viene toccata dalla sua
    // deleteMany (scoping per numeroLinea): resta lì per `confermaTutte`,
    // che la promuove da 'proposta' a 'confermata'.
    const rigaDue = await quoteDiRiga(fattura.id, 2)
    expect(rigaDue).toHaveLength(1)
    expect(rigaDue[0].stato).toBe('confermata')
  })
})
