import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { setupIntegrationDb } from '@/test/integration/db'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { reconcileScheduleWithEntry } from '@/lib/services/schedule-reconciliation-service'
import { imputazioniDivergenti, riallineaFette } from '../riallineamento'

/**
 * La divergenza fra fette e fattura, e il suo riallineamento (Task 7), su
 * database vero: la rilevazione interroga `invoice_line_accounts` con
 * `updatedAt`, che Prisma valorizza da sé a ogni scrittura — un dettaglio
 * che nessun mock potrebbe riprodurre in modo affidabile.
 */
setupIntegrationDb()

interface RigaFixture {
  numeroLinea: number
  descrizione: string
  prezzoTotale: number
  aliquotaIVA: number | null
  accountId: string
  stato?: 'proposta' | 'confermata'
}

/** Fattura con snapshot delle righe e imputazioni per conto, come dopo l'import. */
async function creaFatturaConRighe(
  righe: RigaFixture[],
  overrides: { documentType?: string; rettificaInvoiceId?: string } = {}
) {
  const venueId = (await venueDiTest()).id
  const netto = righe.reduce((s, r) => s + r.prezzoTotale, 0)
  const lordo = righe.reduce((s, r) => s + r.prezzoTotale * (1 + (r.aliquotaIVA ?? 0) / 100), 0)

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
      status: 'RECORDED',
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
    data: righe.map((r) => ({
      invoiceId: fattura.id,
      numeroLinea: r.numeroLinea,
      descrizione: r.descrizione,
      importo: new Prisma.Decimal(r.prezzoTotale.toFixed(2)),
      accountId: r.accountId,
      stato: r.stato ?? 'confermata',
      fonte: 'manuale',
    })),
  })

  return { fattura, lordo: Number(lordo.toFixed(2)) }
}

/** Le fette scritte sul movimento, per conto, in euro. */
async function fettePerConto(journalEntryId: string): Promise<Record<string, number>> {
  const righe = await prisma.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { accountId: true, importo: true },
  })
  // Sommato, non sovrascritto: due riconciliazioni sullo stesso movimento
  // possono finire sullo stesso conto (spec sezione 3, «due righe distinte in
  // archivio... sommate in lettura»), e un `Object.fromEntries` naïf
  // nasconderebbe la seconda riga dietro la prima invece di sommarle.
  const totali = new Map<string, number>()
  for (const r of righe) {
    totali.set(r.accountId, (totali.get(r.accountId) ?? 0) + Number(r.importo))
  }
  return Object.fromEntries(totali)
}

/** L'IVA dichiarata dal movimento, `null` compreso. */
async function ivaDiTestata(journalEntryId: string): Promise<number | null> {
  const movimento = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journalEntryId } })
  return movimento.vatAmount === null ? null : Number(movimento.vatAmount)
}

let venueId: string
let contoAlimentari: string
let contoDetersivi: string
let contoTerzo: string

beforeEach(async () => {
  venueId = (await venueDiTest()).id
  const conti = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { code: 'asc' },
    take: 3,
  })
  contoAlimentari = conti[0].id
  contoDetersivi = conti[1].id
  contoTerzo = conti[2].id
})

/** La fattura mista dell'esempio della spec: 1.000 al 10% e 100 al 22%, 1.222 lordi. */
async function fatturaMista() {
  const { fattura, lordo } = await creaFatturaConRighe([
    { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: 1000, aliquotaIVA: 10, accountId: contoAlimentari },
    { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 100, aliquotaIVA: 22, accountId: contoDetersivi },
  ])
  expect(lordo).toBe(1222)
  return { fattura, lordo }
}

describe('imputazioniDivergenti (Task 7, passo 1)', () => {
  it('nessuna divergenza appena riconciliato: nessuna imputazione è stata toccata', async () => {
    const { fattura, lordo } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')

    expect(await imputazioniDivergenti(movimento.id)).toEqual({
      divergente: false,
      invoiceId: null,
      modificataIl: null,
    })
  })

  it('divergenza quando un\'imputazione cambia dopo che le fette sono nate', async () => {
    const { fattura, lordo } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })

    // Un umano riclassifica i detersivi su un conto diverso, mesi dopo il
    // pagamento: `updatedAt` avanza da sé, Prisma lo gestisce.
    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: fattura.id, numeroLinea: 2, progressivo: 0 } },
      data: { accountId: contoTerzo },
    })

    const divergenza = await imputazioniDivergenti(movimento.id)
    expect(divergenza.divergente).toBe(true)
    expect(divergenza.invoiceId).toBe(fattura.id)
    expect(divergenza.modificataIl).not.toBeNull()
  })

  it('una riga divisa fra più conti (Task 5): la divergenza si vede anche cambiando una sola quota', async () => {
    // Una riga sola, imputata in due quote (progressivo 0 e 1) fra due conti.
    const venue = await venueDiTest()
    const fattura = await prisma.electronicInvoice.create({
      data: {
        venueId: venue.id,
        invoiceNumber: `FT-${Math.random().toString(36).slice(2, 10)}`,
        invoiceDate: new Date('2026-07-01'),
        supplierVat: '01234567890',
        supplierName: 'Fornitore misto',
        totalAmount: new Prisma.Decimal('122.00'),
        netAmount: new Prisma.Decimal('100.00'),
        vatAmount: new Prisma.Decimal('22.00'),
        status: 'RECORDED',
        lineItems: [
          { numeroLinea: 1, descrizione: 'Detersivi assortiti', prezzoUnitario: 100, prezzoTotale: 100, aliquotaIVA: 22 },
        ],
      },
    })
    await prisma.invoiceLineAccount.createMany({
      data: [
        { invoiceId: fattura.id, numeroLinea: 1, progressivo: 0, descrizione: 'Quota A', importo: new Prisma.Decimal('60.00'), accountId: contoDetersivi, stato: 'confermata', fonte: 'manuale' },
        { invoiceId: fattura.id, numeroLinea: 1, progressivo: 1, descrizione: 'Quota B', importo: new Prisma.Decimal('40.00'), accountId: contoTerzo, stato: 'confermata', fonte: 'manuale' },
      ],
    })

    const scadenza = await creaScadenza({ importoTotale: 122, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 122, venueId })
    const esito = await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(esito.outcome).toBe('ok')
    expect(await imputazioniDivergenti(movimento.id)).toMatchObject({ divergente: false })

    // Si tocca SOLO la seconda quota: la rilevazione non deve limitarsi alla prima.
    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: fattura.id, numeroLinea: 1, progressivo: 1 } },
      data: { accountId: contoAlimentari },
    })

    expect(await imputazioniDivergenti(movimento.id)).toMatchObject({ divergente: true, invoiceId: fattura.id })
  })
})

describe('riallineaFette (Task 7, passo 2)', () => {
  it('rigenera le fette dall\'imputazione corrente, non da quella con cui il movimento fu pagato', async () => {
    const { fattura, lordo } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(await fettePerConto(movimento.id)).toEqual({
      [contoAlimentari]: 1100,
      [contoDetersivi]: 122,
    })

    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: fattura.id, numeroLinea: 2, progressivo: 0 } },
      data: { accountId: contoTerzo },
    })
    expect((await imputazioniDivergenti(movimento.id)).divergente).toBe(true)

    const fetteScritte = await prisma.$transaction((tx) => riallineaFette(tx, movimento.id, null))
    expect(fetteScritte).toBe(2)

    // La fetta dei detersivi ora sta sul conto nuovo, non più su quello vecchio,
    // e con lo stesso importo: solo l'attribuzione è cambiata.
    expect(await fettePerConto(movimento.id)).toEqual({
      [contoAlimentari]: 1100,
      [contoTerzo]: 122,
    })
  })

  it('il riallineamento non lascia una divergenza dietro di sé', async () => {
    const { fattura, lordo } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: fattura.id, numeroLinea: 2, progressivo: 0 } },
      data: { accountId: contoTerzo },
    })

    await prisma.$transaction((tx) => riallineaFette(tx, movimento.id, null))

    expect(await imputazioniDivergenti(movimento.id)).toEqual({
      divergente: false,
      invoiceId: null,
      modificataIl: null,
    })
  })

  it('riallineare un movimento senza divergenza non scrive nulla', async () => {
    const { fattura, lordo } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })
    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    const prima = await fettePerConto(movimento.id)

    const fetteScritte = await prisma.$transaction((tx) => riallineaFette(tx, movimento.id, null))

    expect(fetteScritte).toBe(0)
    expect(await fettePerConto(movimento.id)).toEqual(prima)
  })

  it('le fette manuali vincono sempre: il riallineamento le lascia intoccate e non ne scrive di nuove al loro posto', async () => {
    const { fattura, lordo } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: lordo, venueId })
    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: fattura.id, numeroLinea: 2, progressivo: 0 } },
      data: { accountId: contoTerzo },
    })

    // Uno split manuale arriva DOPO la riconciliazione: il codice esistente lo
    // ammette a fianco delle fette ereditate (setEntryAllocations non le tocca).
    await prisma.journalEntryAllocation.create({
      data: {
        journalEntryId: movimento.id,
        accountId: contoTerzo,
        importo: new Prisma.Decimal('1.00'),
        origine: 'manuale',
      },
    })

    const fetteScritte = await prisma.$transaction((tx) => riallineaFette(tx, movimento.id, null))

    // Nessuna fetta ereditata nuova: la guardia "le manuali vincono" si applica
    // anche al riallineamento, esattamente come si applicherebbe a una
    // riconciliazione nuova sullo stesso movimento.
    expect(fetteScritte).toBe(0)
    const fette = await prisma.journalEntryAllocation.findMany({
      where: { journalEntryId: movimento.id },
      select: { origine: true, accountId: true, importo: true },
    })
    expect(fette.map((f) => ({ ...f, importo: Number(f.importo) }))).toEqual([
      { origine: 'manuale', accountId: contoTerzo, importo: 1 },
    ])
  })
})

describe('riallineaFette e l\'IVA di testata (Task 7 su Fase A)', () => {
  it('non riscrive l\'IVA che un essere umano ha dichiarato, anche dopo il riallineamento', async () => {
    const { fattura, lordo } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: lordo, invoiceId: fattura.id, venueId })
    // 30 € dichiarati a mano: la riconciliazione si asterrà già dallo scriverci sopra.
    const movimento = await creaMovimento({ uscita: lordo, iva: 30, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(await ivaDiTestata(movimento.id)).toBe(30)

    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: fattura.id, numeroLinea: 2, progressivo: 0 } },
      data: { accountId: contoTerzo },
    })
    await prisma.$transaction((tx) => riallineaFette(tx, movimento.id, null))

    // Il riallineamento cancella e riscrive le fette, ma il numero che un
    // essere umano ha messo in testata non è mai stato suo da toccare.
    expect(await ivaDiTestata(movimento.id)).toBe(30)
  })

  it("l'IVA di testata segue le fette nuove quando è ancora la nostra, con un totale diverso da prima", async () => {
    // Scenario Task 6 spostato al riallineamento: fattura mista pagata al
    // netto di una nota che non esiste ancora (1.100 di 1.222, come nel test
    // di riconciliazione di Task 6), poi arriva e viene imputata una nota di
    // credito che rettifica i detersivi (100 @22% = 122 lordi). Alla
    // riconciliazione originaria i pesi sono quelli pieni — nessuna nota
    // esisteva — e il pagamento parziale si spalma su entrambi i conti; dopo
    // il riallineamento la nota entra nel calcolo e i detersivi spariscono
    // del tutto: un totale IVA realmente diverso, non lo stesso numero
    // riscritto due volte.
    //
    // Il conto riassegnato è quello degli ALIMENTARI, non quello dei
    // detersivi: serve a innescare la rilevazione del passo 1 (che guarda
    // solo `invoice_line_accounts` della fattura originaria, non delle note
    // di credito collegate — vedi il report) senza toccare il conto su cui
    // la nota rettifica, che altrimenti farebbe scattare la guardia del
    // "peso negativo" di `righeDaSottrarreNote`.
    const { fattura } = await fatturaMista()
    const scadenza = await creaScadenza({ importoTotale: 1222, invoiceId: fattura.id, venueId })
    const movimento = await creaMovimento({ uscita: 1100, venueId })

    await reconcileScheduleWithEntry({
      scheduleId: scadenza.id,
      journalEntryId: movimento.id,
      venueId,
      userId: null,
    })
    expect(await fettePerConto(movimento.id)).toEqual({
      [contoAlimentari]: 990.18,
      [contoDetersivi]: 109.82,
    })

    await creaFatturaConRighe(
      [{ numeroLinea: 1, descrizione: 'Detersivi resi', prezzoTotale: 100, aliquotaIVA: 22, accountId: contoDetersivi }],
      { documentType: 'TD04', rettificaInvoiceId: fattura.id }
    )
    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: fattura.id, numeroLinea: 1, progressivo: 0 } },
      data: { accountId: contoTerzo },
    })
    expect((await imputazioniDivergenti(movimento.id)).divergente).toBe(true)

    const fetteScritte = await prisma.$transaction((tx) => riallineaFette(tx, movimento.id, null))
    expect(fetteScritte).toBe(1)

    // Tutti i 1.100 pagati vanno sugli alimentari (ora sul conto nuovo): la
    // nota, imputata per intero, azzera del tutto i detersivi.
    expect(await fettePerConto(movimento.id)).toEqual({ [contoTerzo]: 1100 })
    expect(await ivaDiTestata(movimento.id)).toBe(100)
  })

  it('un movimento che salda due fatture: riallineare la prima non tocca l\'IVA della seconda', async () => {
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
    expect(await ivaDiTestata(movimento.id)).toBe(244)

    await prisma.invoiceLineAccount.update({
      where: { invoiceId_numeroLinea_progressivo: { invoiceId: prima.fattura.id, numeroLinea: 2, progressivo: 0 } },
      data: { accountId: contoTerzo },
    })

    await prisma.$transaction((tx) => riallineaFette(tx, movimento.id, null))

    // Il totale non cambia — riassegnare un conto non cambia l'IVA del
    // documento — ma deve restare 244 passando per il ritiro e la riscrittura,
    // non per caso: se il ritiro avesse la quota sbagliata il totale finale
    // sarebbe diverso da 244 (vedi il report per la controprova per inversione).
    expect(await ivaDiTestata(movimento.id)).toBe(244)
    expect(await fettePerConto(movimento.id)).toEqual({
      [contoAlimentari]: 1100 + 1100,
      [contoTerzo]: 122,
      [contoDetersivi]: 122,
    })
  })
})
