import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { setupIntegrationDb } from '@/test/integration/db'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { reconcileScheduleWithEntry } from '../schedule-reconciliation-service'

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

/** Fattura con snapshot delle righe e imputazioni per conto, come dopo l'import. */
async function creaFatturaConRighe(righe: RigaFixture[]) {
  const venueId = (await venueDiTest()).id
  const netto = righe.reduce((s, r) => s + r.prezzoTotale, 0)
  const lordo = righe.reduce(
    (s, r) => s + r.prezzoTotale * (1 + (r.aliquotaIVA ?? 0) / 100),
    0
  )

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
  return Object.fromEntries(righe.map((r) => [r.accountId, Number(r.importo)]))
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
