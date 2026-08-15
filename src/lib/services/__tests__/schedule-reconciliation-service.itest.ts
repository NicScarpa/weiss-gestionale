import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { setupIntegrationDb } from '@/test/integration/db'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { prospettoCashFlow } from '@/lib/cashflow/prospetto'
import { LINEA_BOLLO } from '@/lib/sdi/righe-di-sistema'
import {
  reconcileScheduleWithEntry,
  undoScheduleReconciliation,
} from '../schedule-reconciliation-service'

/**
 * L'ereditarietà pro-quota dalla fattura al movimento, su database vero.
 *
 * Qui si verifica la cosa che i test unitari non possono verificare: che le
 * proporzioni scritte in `journal_entry_allocations` corrispondano a quanto è
 * stato davvero pagato. I pesi vengono dalle righe della fattura, che sono
 * imponibili; la quota è un bonifico, che è lordo. Finché le aliquote sono
 * uniformi la differenza non si vede, ed è esattamente il motivo per cui
 * questi test usano aliquote diverse fra le righe.
 */
setupIntegrationDb()

interface RigaFixture {
  numeroLinea: number
  descrizione: string
  /** Imponibile della riga, IVA esclusa. */
  prezzoTotale: number
  /** In punti percentuali: 4, 10, 22. `null` = assente dallo snapshot. */
  aliquotaIVA: number | null
  accountId: string
  stato?: 'proposta' | 'confermata'
}

/**
 * XML minimo che dichiara un bollo virtuale.
 *
 * Serve perché il bollo NON sta in `lineItems`: il servizio lo ricava
 * dall'XML (`righeSistemaTolleranti` → `righeDiSistema`). Uno snapshot senza
 * XML, com'erano tutte le fixture di questo file, faceva tornare sempre
 * `[]` — quindi le righe di sistema di una nota di credito non erano mai
 * entrate né in `righeAttese`, né nell'aliquota 0, né nel confronto della
 * guardia 2. Solo i nodi che il parser attraversa per arrivare a `DatiBollo`.
 */
function xmlConBollo(importoBollo: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Fornitore misto</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Weiss Cafè</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2026-07-01</Data>
        <Numero>1</Numero>
        <DatiBollo>
          <BolloVirtuale>SI</BolloVirtuale>
          <ImportoBollo>${importoBollo.toFixed(2)}</ImportoBollo>
        </DatiBollo>
      </DatiGeneraliDocumento>
    </DatiGenerali>
  </FatturaElettronicaBody>
</FatturaElettronica>`
}

/** Fattura con snapshot delle righe e imputazioni per conto, come dopo l'import. */
async function creaFatturaConRighe(
  righe: RigaFixture[],
  /** Task 6: `documentType` e `rettificaInvoiceId`, per creare una nota di credito. */
  overrides: { documentType?: string; rettificaInvoiceId?: string } = {},
  /**
   * Bollo virtuale: importo e conto su cui è imputato. Non è una riga dello
   * snapshot — è una riga di SISTEMA — quindi genera l'XML e l'imputazione su
   * `LINEA_BOLLO`, e si somma al lordo del documento.
   */
  bollo?: { importo: number; accountId: string }
) {
  const venueId = (await venueDiTest()).id
  const netto = righe.reduce((s, r) => s + r.prezzoTotale, 0) + (bollo?.importo ?? 0)
  const lordo =
    righe.reduce((s, r) => s + r.prezzoTotale * (1 + (r.aliquotaIVA ?? 0) / 100), 0) +
    (bollo?.importo ?? 0)

  const fattura = await prisma.electronicInvoice.create({
    data: {
      venueId,
      invoiceNumber: `FT-${Math.random().toString(36).slice(2, 10)}`,
      invoiceDate: new Date('2026-07-01'),
      supplierVat: '01234567890',
      supplierName: 'Fornitore misto',
      totalAmount: new Prisma.Decimal(lordo.toFixed(2)),
      netAmount: new Prisma.Decimal(netto.toFixed(2)),
      vatAmount: new Prisma.Decimal((lordo - netto).toFixed(2)),
      status: 'CATEGORIZED',
      xmlContent: bollo ? xmlConBollo(bollo.importo) : null,
      ...overrides,
      lineItems: righe.map((r) => ({
        numeroLinea: r.numeroLinea,
        descrizione: r.descrizione,
        prezzoUnitario: r.prezzoTotale,
        prezzoTotale: r.prezzoTotale,
        ...(r.aliquotaIVA === null ? {} : { aliquotaIVA: r.aliquotaIVA }),
      })),
    },
  })

  await prisma.invoiceLineAccount.createMany({
    data: [
      ...righe.map((r) => ({
        invoiceId: fattura.id,
        numeroLinea: r.numeroLinea,
        descrizione: r.descrizione,
        importo: new Prisma.Decimal(r.prezzoTotale.toFixed(2)),
        accountId: r.accountId,
        stato: r.stato ?? 'confermata',
        fonte: 'manuale',
      })),
      ...(bollo
        ? [
            {
              invoiceId: fattura.id,
              numeroLinea: LINEA_BOLLO,
              descrizione: 'Imposta di bollo',
              importo: new Prisma.Decimal(bollo.importo.toFixed(2)),
              accountId: bollo.accountId,
              stato: 'confermata',
              fonte: 'manuale',
            },
          ]
        : []),
    ],
  })

  return { fattura, lordo: Number(lordo.toFixed(2)) }
}

/** Le fette scritte sul movimento, per conto, in euro. */
async function fettePerConto(journalEntryId: string): Promise<Record<string, number>> {
  const righe = await prisma.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { accountId: true, importo: true },
  })
  return Object.fromEntries(righe.map((r) => [r.accountId, Number(r.importo)]))
}

/** Le fette scritte sul movimento, per conto, con importo e IVA in euro. */
async function fetteConIvaPerConto(
  journalEntryId: string
): Promise<Record<string, { importo: number; iva: number | null }>> {
  const righe = await prisma.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { accountId: true, importo: true, iva: true },
  })
  return Object.fromEntries(
    righe.map((r) => [r.accountId, { importo: Number(r.importo), iva: r.iva === null ? null : Number(r.iva) }])
  )
}

let venueId: string
let contoAlimentari: string
let contoDetersivi: string

beforeEach(async () => {
  venueId = (await venueDiTest()).id
  const conti = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { code: 'asc' },
    take: 2,
  })
  contoAlimentari = conti[0].id
  contoDetersivi = conti[1].id
})

describe('ereditarietà pro-quota e aliquote IVA', () => {
  it('le proporzioni seguono il lordo effettivamente pagato, non gli imponibili', async () => {
    // Alimentari 1.000 € + 4% = 1.040 €; detersivi 200 € + 22% = 244 €.
    // Pagato 1.284 €. Sui soli imponibili le proporzioni sarebbero 1.000:200,
    // cioè 1.070 € e 214 €: trenta euro sul conto sbagliato.
    const { fattura, lordo } = await creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Alimentari', prezzoTotale: 1000, aliquotaIVA: 4, accountId: contoAlimentari },
      { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 200, aliquotaIVA: 22, accountId: contoDetersivi },
    ])
    expect(lordo).toBe(1284)

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    expect(await fettePerConto(movimento.id)).toEqual({
      [contoAlimentari]: 1040,
      [contoDetersivi]: 244,
    })
  })

  it('con aliquote uguali fra le righe il risultato non cambia', async () => {
    const { fattura, lordo } = await creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Birra', prezzoTotale: 700, aliquotaIVA: 22, accountId: contoAlimentari },
      { numeroLinea: 2, descrizione: 'Vino', prezzoTotale: 300, aliquotaIVA: 22, accountId: contoDetersivi },
    ])

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })

    // 70% e 30% del lordo, come sarebbe stato anche sui soli imponibili
    expect(await fettePerConto(movimento.id)).toEqual({
      [contoAlimentari]: 854,
      [contoDetersivi]: 366,
    })
  })

  it("senza aliquota nello snapshot si ripiega sull'imponibile invece di sbagliare", async () => {
    // Le fatture importate prima che lo snapshot portasse l'aliquota, o un
    // fornitore che non la compila: la ripartizione resta quella di prima,
    // approssimata ma non arbitraria.
    const { fattura } = await creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Alimentari', prezzoTotale: 1000, aliquotaIVA: null, accountId: contoAlimentari },
      { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 200, aliquotaIVA: null, accountId: contoDetersivi },
    ])

    const scadenza = await creaScadenza({ importoTotale: 1284, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 1284, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })

    expect(await fettePerConto(movimento.id)).toEqual({
      [contoAlimentari]: 1070,
      [contoDetersivi]: 214,
    })
  })

  it('la somma delle fette è sempre la quota, qualunque siano le aliquote', async () => {
    const { fattura } = await creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Alimentari', prezzoTotale: 833.33, aliquotaIVA: 4, accountId: contoAlimentari },
      { numeroLinea: 2, descrizione: 'Imballo', prezzoTotale: 0.01, aliquotaIVA: 22, accountId: contoDetersivi },
    ])

    const scadenza = await creaScadenza({ importoTotale: 500, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 500, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })

    const fette = Object.values(await fettePerConto(movimento.id))
    expect(Number(fette.reduce((s, v) => s + v, 0).toFixed(2))).toBe(500)
  })

  it('scrive sulla fetta l\'IVA della sua aliquota, non una media', async () => {
    const { fattura, lordo } = await creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: 1000, aliquotaIVA: 10, accountId: contoAlimentari },
      { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 100, aliquotaIVA: 22, accountId: contoDetersivi },
    ])
    expect(lordo).toBe(1222)

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    const fette = await fetteConIvaPerConto(movimento.id)

    expect(fette[contoAlimentari]).toEqual({ importo: 1100, iva: 100 })
    expect(fette[contoDetersivi]).toEqual({ importo: 122, iva: 22 })
    // E la somma resta l'IVA del documento: 122.
    expect(Object.values(fette).reduce((s, f) => s + (f.iva ?? 0), 0)).toBe(122)
  })

  it('una riga solo proposta blocca ancora tutta l\'ereditarietà', async () => {
    const { fattura, lordo } = await creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Alimentari', prezzoTotale: 1000, aliquotaIVA: 4, accountId: contoAlimentari },
      { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 200, aliquotaIVA: 22, accountId: contoDetersivi, stato: 'proposta' },
    ])

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })

    expect(await fettePerConto(movimento.id)).toEqual({})
  })
})

/**
 * L'IVA di testata e il prospetto che la legge.
 *
 * Le fette esatte da sole non bastavano: il movimento che l'import bancario
 * crea non dichiara alcuna IVA, e il prospetto la toglieva alla testata una
 * fetta per volta finché la testata non ne aveva −122. Siccome dopo la
 * riconciliazione il conto di testata è quello della fetta dominante, quel
 * numero negativo si sommava proprio alla famiglia più grossa: alimentari
 * −1.122 invece di −1.000, pulizia −100 (giusta), e i 122 di IVA che non
 * arrivavano mai al blocco G2. Nessuno dei quattro controlli di quadratura
 * poteva vederlo — guardano il lordo, contano i conti, o quadrano per
 * identità algebrica qualunque sia la distribuzione dell'IVA fra i conti.
 *
 * Per questo il prospetto qui si legge davvero, non si simula.
 */
/** Il conto del piano v4 per codice: il prospetto ragiona sui codici. */
async function contoPerCodice(code: string): Promise<string> {
  const conto = await prisma.account.findFirst({ where: { code }, select: { id: true } })
  if (!conto) throw new Error(`Conto ${code} assente dal seed del database di test`)
  return conto.id
}

/** Il valore annuale di una riga del prospetto, per codice di riclassificazione. */
function valoreAnnuo(righe: { codice: string; valori: { annual: number } }[], codice: string) {
  const riga = righe.find((r) => r.codice === codice)
  if (!riga) throw new Error(`Riga ${codice} assente dal prospetto`)
  return riga.valori.annual
}

/** La fattura mista dell'esempio: 1.000 al 10% e 100 al 22%, 1.222 lordi. */
async function fatturaMista() {
  const food = await contoPerCodice('20.4.01')
  const pulizia = await contoPerCodice('20.5.04')
  const { fattura, lordo } = await creaFatturaConRighe([
    { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: 1000, aliquotaIVA: 10, accountId: food },
    { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia },
  ])
  expect(lordo).toBe(1222)
  return { fattura, lordo, food, pulizia }
}

/** L'IVA dichiarata dal movimento, `null` compreso. */
async function ivaDiTestata(journalEntryId: string): Promise<number | null> {
  const movimento = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journalEntryId } })
  return movimento.vatAmount === null ? null : Number(movimento.vatAmount)
}

describe('IVA di testata dopo la riconciliazione', () => {
  it('il movimento eredita l\'IVA delle sue fette, che prima non dichiarava', async () => {
    const { fattura, lordo } = await fatturaMista()

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    // Senza `iva`: è così che nascono i movimenti dell'import bancario, del
    // motore delle regole e dell'esecuzione di un pagamento.
    const movimento = await creaMovimento({ uscita: lordo, venueId })
    expect(movimento.vatAmount).toBeNull()

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    const dopo = await prisma.journalEntry.findUniqueOrThrow({ where: { id: movimento.id } })
    expect(Number(dopo.vatAmount)).toBe(122)
  })

  it('un movimento che salda due fatture somma le due IVA invece di fermarsi alla prima', async () => {
    // Il bonifico cumulativo: due fatture, due riconciliazioni, due gruppi di
    // fette. La seconda trova in testata l'IVA che ha scritto la prima —
    // esattamente quella delle fette già presenti — e la riconosce come
    // propria: aggiorna il totale invece di astenersi.
    const prima = await fatturaMista()
    const seconda = await fatturaMista()
    const movimento = await creaMovimento({ uscita: 2444, venueId })

    for (const { fattura, lordo } of [prima, seconda]) {
      const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
      const esito = await reconcileScheduleWithEntry({
        scheduleId: scadenza.id,
        journalEntryId: movimento.id,
        venueId,
        userId: null,
      })
      expect(esito.outcome).toBe('ok')
    }

    const dopo = await prisma.journalEntry.findUniqueOrThrow({ where: { id: movimento.id } })
    expect(Number(dopo.vatAmount)).toBe(244)
  })

  it('il prospetto riceve i 122 di IVA e nessuna famiglia porta quella di un\'altra', async () => {
    const { fattura, lordo } = await fatturaMista()

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId, date: new Date('2026-08-03') })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    const { prospetto } = await prospettoCashFlow(venueId, 2026)

    // B4 «Food» al netto della sua IVA, B5 «Consumabili di servizio» al netto
    // della sua, e i 122 nel blocco G2 dove l'IVA pagata deve stare.
    expect(valoreAnnuo(prospetto.righe, 'B4')).toBe(-1000)
    expect(valoreAnnuo(prospetto.righe, 'B5')).toBe(-100)
    expect(valoreAnnuo(prospetto.righe, 'G2')).toBe(-122)
  })

  it('non riscrive l\'IVA che un essere umano ha già dichiarato, e il prospetto regge lo stesso', async () => {
    const { fattura, lordo } = await fatturaMista()

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    // Movimento inserito a mano con 30 € di IVA: un numero che qualcuno ha
    // scritto, e che la riconciliazione non è autorizzata a correggere.
    const movimento = await creaMovimento({
      uscita: lordo,
      iva: 30,
      venueId,
      date: new Date('2026-08-03'),
    })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })

    const dopo = await prisma.journalEntry.findUniqueOrThrow({ where: { id: movimento.id } })
    expect(Number(dopo.vatAmount)).toBe(30)

    // La testata dichiara meno delle sue fette: cede i 30 che ha e non un
    // centesimo di più. Le famiglie restano quelle vere, il blocco IVA riceve
    // quanto le fette dichiarano — di più di quanto la testata ammetta, ed è
    // la scelta voluta: la fattura è la fonte autorevole.
    const { prospetto } = await prospettoCashFlow(venueId, 2026)
    expect(valoreAnnuo(prospetto.righe, 'B4')).toBe(-1000)
    expect(valoreAnnuo(prospetto.righe, 'B5')).toBe(-100)
    expect(valoreAnnuo(prospetto.righe, 'G2')).toBe(-122)
  })
})

/**
 * L'annullo, che è lo specchio.
 *
 * Difetto nato con l'ereditarietà dell'IVA e impossibile prima: fino a quando
 * `vatAmount` restava sempre `null` non c'era niente da ritirare. Adesso un
 * movimento annullato conserverebbe l'IVA della fattura che non salda più, e
 * la regola di proprietà — che è quella giusta — se ne laverebbe le mani per
 * sempre, perché quel numero non corrisponde più alle fette. Sul prospetto è
 * C1 col segno rovesciato: la testata dichiara più di quanto le fette
 * chiedano, il tetto non morde (interviene nel verso opposto) e il conto
 * dominante si gonfia della differenza.
 */
describe("IVA di testata dopo l'annullo", () => {
  /** Fattura a una riga sola, sul conto Food: serve a variare l'IVA. */
  async function fatturaSemplice(imponibile: number, aliquota: number) {
    const food = await contoPerCodice('20.4.01')
    return creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: imponibile, aliquotaIVA: aliquota, accountId: food },
    ])
  }

  async function riconcilia(fattura: { id: string }, lordo: number, journalEntryId: string) {
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId,
      venueId,
      userId: null,
    })
    if (esito.outcome !== 'ok') throw new Error(`Riconciliazione fallita: ${esito.outcome}`)
    return esito.reconciliationId
  }

  it("annullato e riconciliato con un'altra fattura, il movimento porta l'IVA nuova", async () => {
    const movimento = await creaMovimento({ uscita: 1100, venueId, date: new Date('2026-08-03') })

    // Prima fattura: 1.000 al 10%, cioè 1.100 lordi e 100 di IVA.
    const prima = await fatturaSemplice(1000, 10)
    const reconciliationId = await riconcilia(prima.fattura, prima.lordo, movimento.id)
    expect(await ivaDiTestata(movimento.id)).toBe(100)

    expect(
      (await undoScheduleReconciliation({ reconciliationId, venueId })).outcome
    ).toBe('ok')
    // Nessuna fetta rimasta: si torna a «non dichiarata», non a zero. Il
    // movimento è di nuovo quello che era prima di essere riconciliato.
    expect(await ivaDiTestata(movimento.id)).toBeNull()

    // Seconda fattura, altra aliquota: 1.000 al 4%, cioè 1.040 lordi e 40 di IVA.
    const seconda = await fatturaSemplice(1000, 4)
    await riconcilia(seconda.fattura, seconda.lordo, movimento.id)
    expect(await ivaDiTestata(movimento.id)).toBe(40)

    // Sul prospetto: Food porta i 1.000 di imponibile della fattura nuova più
    // i 60 del movimento che nessuna fetta copre, e il blocco IVA riceve 40.
    // Senza il ritiro la testata dichiarerebbe ancora 100: la riconciliazione
    // nuova si asterrebbe, 60 € di IVA senza importo resterebbero addosso al
    // conto dominante e G2 riceverebbe l'IVA della fattura sbagliata.
    const { prospetto } = await prospettoCashFlow(venueId, 2026)
    expect(valoreAnnuo(prospetto.righe, 'B4')).toBe(-1060)
    expect(valoreAnnuo(prospetto.righe, 'G2')).toBe(-40)
  })

  it("annullata una sola riconciliazione di un bonifico cumulativo, resta l'IVA della superstite", async () => {
    const movimento = await creaMovimento({ uscita: 2444, venueId })
    const prima = await fatturaMista()
    const seconda = await fatturaMista()

    await riconcilia(prima.fattura, prima.lordo, movimento.id)
    const daAnnullare = await riconcilia(seconda.fattura, seconda.lordo, movimento.id)
    expect(await ivaDiTestata(movimento.id)).toBe(244)

    await undoScheduleReconciliation({ reconciliationId: daAnnullare, venueId })

    // Le fette della prima riconciliazione ci sono ancora: la testata scende
    // alla loro IVA, non a zero e non a `null`.
    expect(await ivaDiTestata(movimento.id)).toBe(122)
  })

  it("non ritira l'IVA che un essere umano ha dichiarato e che le fette non spiegano", async () => {
    const movimento = await creaMovimento({ uscita: 1222, iva: 30, venueId })
    const { fattura, lordo } = await fatturaMista()

    const reconciliationId = await riconcilia(fattura, lordo, movimento.id)
    // L'ereditarietà si era già astenuta: quei 30 non sono suoi.
    expect(await ivaDiTestata(movimento.id)).toBe(30)

    await undoScheduleReconciliation({ reconciliationId, venueId })

    expect(await ivaDiTestata(movimento.id)).toBe(30)
  })

  it('annullare e ri-riconciliare la stessa fattura riporta la stessa IVA, non `null`', async () => {
    const movimento = await creaMovimento({ uscita: 1222, venueId })
    const { fattura, lordo } = await fatturaMista()

    const reconciliationId = await riconcilia(fattura, lordo, movimento.id)
    await undoScheduleReconciliation({ reconciliationId, venueId })
    expect(await ivaDiTestata(movimento.id)).toBeNull()

    await riconcilia(fattura, lordo, movimento.id)
    expect(await ivaDiTestata(movimento.id)).toBe(122)
  })
})

/**
 * Task 6: la nota di credito entra nel calcolo dei pesi, su database vero.
 *
 * Lo scenario è quello della spec (sezione 4): fattura mista 1.000 @10% +
 * 100 @22% = 1.222 lordi, nota di credito che rettifica i detersivi resi
 * (100 @22% = 122 lordi), pagamento netto di 1.100 — quanto resta dopo la
 * nota. Atteso: alimentari 1.100, pulizia sparita (0), non la proporzione
 * vecchia che ignora la nota (≈990 / ≈110).
 */
describe('nota di credito che rettifica (Task 6)', () => {
  it('un pagamento netto della fattura eredita 1.100 su alimentari, e pulizia non compare più', async () => {
    const { fattura, lordo, food, pulizia } = await fatturaMista()
    expect(lordo).toBe(1222)

    // Nota di credito TD04, collegata alla fattura come lo sarebbe all'import
    // (route.ts risolve `rettificaInvoiceId` leggendo l'XML: qui si assume
    // già risolto, non lo si testa in questo file), imputata per intero sullo
    // stesso conto pulizia che rettifica.
    await creaFatturaConRighe(
      [{ numeroLinea: 1, descrizione: 'Detersivi resi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia }],
      { documentType: 'TD04', rettificaInvoiceId: fattura.id }
    )

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    // Pagamento netto: 1.222 (fattura) − 122 (nota) = 1.100. Lo scadenzario
    // resta a 1.222 (fuori perimetro, spec sezione 4): qui si verifica solo
    // che la parte pagata si divida bene.
    const movimento = await creaMovimento({ uscita: 1100, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    // Numeri letterali dello scenario, non ricavati dalle mappe del codice
    // sotto test: se la sottrazione si rompe questo confronto deve fallire
    // con la proporzione vecchia, non con sé stesso.
    expect(await fettePerConto(movimento.id)).toEqual({ [food]: 1100 })
  })

  it('nota di credito non imputata: l\'ereditarietà si astiene, il movimento resta senza fette (non la vecchia proporzione)', async () => {
    const { fattura, lordo, pulizia } = await fatturaMista()

    // La nota esiste ed è collegata, ma la sua riga non è stata confermata:
    // sottrarne una parte darebbe un risultato peggiore di non sottrarre
    // nulla, perché sembrerebbe corretto.
    await creaFatturaConRighe(
      [
        {
          numeroLinea: 1,
          descrizione: 'Detersivi resi',
          prezzoTotale: 100,
          aliquotaIVA: 22,
          accountId: pulizia,
          stato: 'proposta',
        },
      ],
      { documentType: 'TD04', rettificaInvoiceId: fattura.id }
    )

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 1100, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')
    expect(await fettePerConto(movimento.id)).toEqual({})
  })

  it('round 2 — una nota di DEBITO (TD05) collegata non si sottrae: i pesi restano quelli pieni', async () => {
    // TD05 aumenta il dovuto, non lo riduce: se venisse sottratta come una
    // nota di credito il segno si inverte due volte. Il filtro che la
    // esclude vive nella query SQL (`documentType: { in: ['TD04','TD08'] }`),
    // quindi va provato su un database vero — un mock di Prisma non applica
    // mai un `where`, restituirebbe la riga a prescindere dal filtro.
    //
    // La quota è 1.100, non il lordo pieno (1.222): con un pagamento pieno
    // la guardia "pagamento non compensato" (round 2) interverrebbe comunque
    // e mascererebbe questo difetto specifico, ripiegando sui pesi pieni per
    // una ragione diversa. A 1.100 — esattamente il totale ridotto SE la
    // nota di debito venisse (erroneamente) sottratta come fosse di credito
    // — quella guardia non scatta, e il difetto, se presente, resta isolato:
    // pulizia sparirebbe (0) invece di ricevere la sua quota proporzionale.
    const { fattura, lordo, food, pulizia } = await fatturaMista()
    expect(lordo).toBe(1222)

    await creaFatturaConRighe(
      [{ numeroLinea: 1, descrizione: 'Addebito extra', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia }],
      { documentType: 'TD05', rettificaInvoiceId: fattura.id }
    )

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 1100, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    // Pagamento parziale sui pesi PIENI (1.100 di 1.222): pulizia riceve la
    // sua quota proporzionale, non zero. Se la nota di debito venisse
    // sottratta, pulizia sparirebbe del tutto e alimentari prenderebbe
    // l'intera quota (1.100).
    expect(await fettePerConto(movimento.id)).toEqual({ [food]: 990.18, [pulizia]: 109.82 })
  })

  it("round 3 — con un'aliquota illeggibile la nota si sottrae comunque: i pesi non sono lordi e il confronto con la quota non sarebbe omogeneo", async () => {
    // La guardia «pagamento non compensato» confronta la quota (un pagamento,
    // quindi LORDO) con la somma dei pesi. Quel confronto ha senso solo se i
    // pesi sono lordi anche loro — cioè se ogni aliquota era leggibile. Basta
    // una riga senza aliquota nello snapshot perché `calcolaPesiConIva` cada
    // nel tutto-o-niente: le fette diventano `iva: null` e il peso di QUELLA
    // riga resta l'imponibile nudo (`aliquota ?? 0`). Da lì in poi si
    // confronta un lordo con una somma che lordo non è, `quota >
    // totaleRidotto` risulta vero quasi sempre, e la nota di credito non
    // viene MAI sottratta su queste fatture — con un log che per giunta
    // afferma il falso («non compensata su questo pagamento»: compensata lo
    // era, sbagliato era il confronto).
    const food = await contoPerCodice('20.4.01')
    const pulizia = await contoPerCodice('20.5.04')
    const altri = await contoPerCodice('20.5.05')

    const { fattura } = await creaFatturaConRighe([
      { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: 1000, aliquotaIVA: 10, accountId: food },
      { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia },
      // L'aliquota c'è sul documento (22%) ma non nello snapshot: è la riga
      // che fa cadere il tutto-o-niente.
      { numeroLinea: 3, descrizione: 'Tovaglioli', prezzoTotale: 200, aliquotaIVA: null, accountId: altri },
    ])

    await creaFatturaConRighe(
      [{ numeroLinea: 1, descrizione: 'Detersivi resi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia }],
      { documentType: 'TD04', rettificaInvoiceId: fattura.id }
    )

    // Numeri del documento, non del codice: 1.100 (farina) + 122 (detersivi)
    // + 244 (tovaglioli al 22%) = 1.466 lordi. La nota ne toglie 122, quindi
    // si paga 1.344.
    const scadenza = await creaScadenza({ importoTotale: 1466, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 1344, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    // Pesi ridotti: farina 1.100, tovaglioli 200 (imponibile nudo), pulizia
    // azzerata dalla nota. 1.344 ripartiti su 1.300 → 1.344 × 1.100/1.300 =
    // 1.137,23 e il resto, 206,77, ai tovaglioli. Pulizia non compare: è
    // stata interamente resa.
    //
    // Con la guardia attiva su questi pesi si tornava invece ai pesi pieni
    // (1.100 + 122 + 200 = 1.422) e pulizia si prendeva 115,31 di un
    // pagamento da cui la nota l'aveva già cancellata.
    expect(await fettePerConto(movimento.id)).toEqual({ [food]: 1137.23, [altri]: 206.77 })
  })

  it('round 3 — la nota di credito porta a sua volta un bollo: i due bolli si annullano sullo stesso conto', async () => {
    // La combinazione che nessun test di Task 6 esercitava: le note delle
    // fixture nascevano senza XML, quindi `righeSistemaTolleranti` tornava
    // sempre `[]` e le tre cose che una riga di sistema della nota fa —
    // entrare in `righeAttese`, ricevere aliquota 0, entrare nel confronto
    // della guardia 2 — non erano mai state provate insieme.
    const food = await contoPerCodice('20.4.01')
    const pulizia = await contoPerCodice('20.5.04')
    const contoBollo = await contoPerCodice('30.01')

    const { fattura, lordo } = await creaFatturaConRighe(
      [
        { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: 1000, aliquotaIVA: 10, accountId: food },
        { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia },
      ],
      {},
      { importo: 2, accountId: contoBollo }
    )
    // 1.100 + 122 + 2 di bollo.
    expect(lordo).toBe(1224)

    await creaFatturaConRighe(
      [{ numeroLinea: 1, descrizione: 'Detersivi resi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia }],
      { documentType: 'TD04', rettificaInvoiceId: fattura.id },
      { importo: 2, accountId: contoBollo }
    )

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    // 1.224 − 124 (122 di detersivi + 2 di bollo reso) = 1.100.
    const movimento = await creaMovimento({ uscita: 1100, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    // I due bolli stanno sullo stesso conto e si annullano, come i detersivi:
    // resta la sola farina. Se il bollo della nota non entrasse nei pesi,
    // 30.01 comparirebbe qui con i suoi 2 €.
    //
    // L'importo da solo non discrimina (revisione, ri-verifica): se il bollo
    // della nota non venisse riconosciuto come riga con aliquota nota — cioè
    // se `aliquotePerLineaNota` non ricevesse la sua voce da `righeSistemaNota`
    // — la riga del bollo di QUESTA fattura (aliquota 0, letta dal proprio
    // XML) e quella, col segno invertito, della nota (aliquota `undefined`,
    // se la sua non venisse letta) si annullerebbero comunque nell'importo
    // (2 − 2 = 0, filtrato) mentre il tutto-o-niente di `calcolaPesiConIva`
    // azzererebbe l'IVA di OGNI fetta, farina compresa: stesso importo,
    // `iva: null` invece di `100`. Solo l'IVA della fetta lo distingue.
    expect(await fetteConIvaPerConto(movimento.id)).toEqual({ [food]: { importo: 1100, iva: 100 } })
  })

  it('round 3 — il bollo della nota su un conto che la fattura non alimenta: l\'ereditarietà si astiene per intero', async () => {
    // Comportamento voluto, fissato qui perché è silenzioso e sproporzionato
    // a prima vista: 2 € di bollo su un conto sbagliato fanno rinunciare
    // all'ereditarietà di un pagamento da 1.100. La guardia 2 non ha una
    // granularità per conto — astenersi solo sul bollo significherebbe
    // sottrarre il resto della nota lasciando fuori una parte, cioè scrivere
    // pesi che non corrispondono a nessuna lettura coerente dei due
    // documenti. Astenersi del tutto non scrive nulla di sbagliato; il limite
    // vero è che l'unico segnale è un `logger.warn`.
    const food = await contoPerCodice('20.4.01')
    const pulizia = await contoPerCodice('20.5.04')
    const contoBollo = await contoPerCodice('30.01')
    const altroConto = await contoPerCodice('30.02')

    const { fattura, lordo } = await creaFatturaConRighe(
      [
        { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: 1000, aliquotaIVA: 10, accountId: food },
        { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia },
      ],
      {},
      { importo: 2, accountId: contoBollo }
    )

    // Stesso bollo, conto diverso: la nota toglierebbe 2 € da un conto che la
    // fattura non ha mai alimentato, quindi il peso risultante sarebbe
    // negativo.
    await creaFatturaConRighe(
      [{ numeroLinea: 1, descrizione: 'Detersivi resi', prezzoTotale: 100, aliquotaIVA: 22, accountId: pulizia }],
      { documentType: 'TD04', rettificaInvoiceId: fattura.id },
      { importo: 2, accountId: altroConto }
    )

    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 1100, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    // La riconciliazione riesce comunque: si astiene l'ereditarietà, non il
    // collegamento fra movimento e scadenza.
    expect(esito.outcome).toBe('ok')
    expect(await fettePerConto(movimento.id)).toEqual({})
  })
})
