import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc, romeDateKey } from '@/lib/timezone'
import {
  giornoCorrente,
  giornoIndietro,
  movimentiPerContoEMese,
  saldiAlGiorno,
} from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'

/**
 * Cosa entra e cosa non entra in un saldo.
 *
 * La quadratura fra le schermate è verificata altrove
 * (`test/integration/quadratura.itest.ts`); qui si prova la definizione in sé,
 * caso per caso, perché ogni riga di questi test corrisponde a un modo in cui
 * il saldo mostrava un numero diverso da quello vero.
 */
setupIntegrationDb()

const ANNO = Number(romeDateKey(new Date()).slice(0, 4))
const OGGI = giornoCorrente()

async function movimento(
  venueId: string,
  valori: { giorno: string; entrata?: number; uscita?: number; nascosto?: boolean }
) {
  return prisma.journalEntry.create({
    data: {
      venueId,
      date: toDateOnlyUtc(valori.giorno),
      registerType: 'BANK',
      description: 'Movimento di prova',
      debitAmount: valori.entrata ?? null,
      creditAmount: valori.uscita ?? null,
      hiddenAt: valori.nascosto ? new Date() : null,
      costCenterId: await centroDiCostoDiDefault(),
    },
  })
}

describe('saldi dei registri', () => {
  it('somma il saldo iniziale dell\'anno ai movimenti dell\'anno', async () => {
    const venue = await venueDiTest()
    await prisma.initialBalance.create({
      data: { venueId: venue.id, year: ANNO, cashBalance: 0, bankBalance: 1000 },
    })
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 250 })

    const saldi = await saldiAlGiorno(venue.id)

    expect(saldi.registers.BANK.openingBalance).toBe(1000)
    expect(saldi.registers.BANK.closingBalance).toBe(1250)
    expect(saldi.annoApertura).toBe(ANNO)
  })

  // Il saldo iniziale è la fotografia di fine anno precedente: i movimenti che
  // l'hanno prodotta sono già dentro quella cifra.
  it("ignora i movimenti precedenti all'anno del saldo iniziale", async () => {
    const venue = await venueDiTest()
    await prisma.initialBalance.create({
      data: { venueId: venue.id, year: ANNO, cashBalance: 0, bankBalance: 1000 },
    })
    await movimento(venue.id, { giorno: `${ANNO - 1}-12-31`, entrata: 5000 })

    expect((await saldiAlGiorno(venue.id)).registers.BANK.closingBalance).toBe(1000)
  })

  // A gennaio la riga del nuovo anno non c'è ancora: senza il riporto il saldo
  // crollerebbe al valore dell'apertura precedente più i soli movimenti nuovi.
  it("in assenza del saldo iniziale dell'anno riporta quello dell'anno prima", async () => {
    const venue = await venueDiTest()
    await prisma.initialBalance.create({
      data: { venueId: venue.id, year: ANNO - 1, cashBalance: 0, bankBalance: 1000 },
    })
    await movimento(venue.id, { giorno: `${ANNO - 1}-07-01`, entrata: 300 })
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 200 })

    const saldi = await saldiAlGiorno(venue.id)

    expect(saldi.annoApertura).toBe(ANNO - 1)
    expect(saldi.registers.BANK.closingBalance).toBe(1500)
  })

  it('senza alcun saldo iniziale parte da zero e conta tutti i movimenti', async () => {
    const venue = await venueDiTest()
    await movimento(venue.id, { giorno: `${ANNO - 2}-03-01`, entrata: 100 })
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 50 })

    const saldi = await saldiAlGiorno(venue.id)

    expect(saldi.annoApertura).toBeNull()
    expect(saldi.registers.BANK.closingBalance).toBe(150)
  })

  it('esclude i movimenti nascosti', async () => {
    const venue = await venueDiTest()
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 100 })
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 999, nascosto: true })

    expect((await saldiAlGiorno(venue.id)).registers.BANK.closingBalance).toBe(100)
  })

  it('esclude i movimenti cancellati', async () => {
    const venue = await venueDiTest()
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 100 })
    const cancellato = await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 999 })
    await prisma.journalEntry.update({
      where: { id: cancellato.id },
      data: { deletedAt: new Date() },
    })

    expect((await saldiAlGiorno(venue.id)).registers.BANK.closingBalance).toBe(100)
  })

  // Chiedere il saldo di ieri non deve restituire quello di oggi: è la stessa
  // proprietà su cui poggia il trend a sette giorni del cash flow.
  it('il saldo a una data passata ignora i movimenti successivi', async () => {
    const venue = await venueDiTest()
    const ieri = giornoIndietro(OGGI, 1)
    await movimento(venue.id, { giorno: ieri, entrata: 100 })
    await movimento(venue.id, { giorno: OGGI, entrata: 40 })

    expect((await saldiAlGiorno(venue.id, ieri)).registers.BANK.closingBalance).toBe(100)
    expect((await saldiAlGiorno(venue.id, OGGI)).registers.BANK.closingBalance).toBe(140)
  })

  // Somme di centesimi che in virgola mobile darebbero 0.30000000000000004.
  it('somma i centesimi senza errore di arrotondamento', async () => {
    const venue = await venueDiTest()
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 0.1 })
    await movimento(venue.id, { giorno: `${ANNO}-01-01`, entrata: 0.2 })

    expect((await saldiAlGiorno(venue.id)).registers.BANK.closingBalance).toBe(0.3)
  })
})

/**
 * La suddivisione di un movimento fra più conti (F2-ALL-002).
 *
 * Fino all'8 agosto 2026 le fette non erano lette da nessun report: il badge
 * «Suddiviso (2)» compariva nell'elenco, ma nel budget l'intero importo restava
 * sul conto principale. Il titolare divideva 1.000 € in 700 Alimentari e 300
 * Pulizie e vedeva Alimentari 1.000 e Pulizie 0 — la distanza fra ciò che
 * credeva di aver fatto e i numeri era l'intero importo del movimento.
 */
describe('movimenti per conto: le suddivisioni contano', () => {
  async function conto(nome: string, tipo: 'COSTO' | 'RICAVO' = 'COSTO') {
    return prisma.account.create({
      data: { code: `T${Math.random().toString(36).slice(2, 8)}`, name: nome, type: tipo },
    })
  }

  it('senza fette, l importo intero resta sul conto del movimento', async () => {
    const venue = await venueDiTest()
    const alimentari = await conto('Alimentari')
    const entry = await movimento(venue.id, { giorno: `${ANNO}-03-10`, uscita: 1000 })
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { accountId: alimentari.id },
    })

    const righe = await movimentiPerContoEMese(venue.id, ANNO)
    const riga = righe.find((r) => r.accountId === alimentari.id && r.mese === 3)

    expect(riga?.avere.toNumber()).toBe(1000)
  })

  it('con le fette, ogni conto prende la sua parte', async () => {
    const venue = await venueDiTest()
    const alimentari = await conto('Alimentari')
    const pulizie = await conto('Pulizie')
    const entry = await movimento(venue.id, { giorno: `${ANNO}-03-10`, uscita: 1000 })
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { accountId: alimentari.id },
    })
    await prisma.journalEntryAllocation.createMany({
      data: [
        { journalEntryId: entry.id, accountId: alimentari.id, importo: 700, origine: 'manuale' },
        { journalEntryId: entry.id, accountId: pulizie.id, importo: 300, origine: 'manuale' },
      ],
    })

    const righe = await movimentiPerContoEMese(venue.id, ANNO)

    expect(
      righe.find((r) => r.accountId === alimentari.id && r.mese === 3)?.avere.toNumber()
    ).toBe(700)
    expect(
      righe.find((r) => r.accountId === pulizie.id && r.mese === 3)?.avere.toNumber()
    ).toBe(300)
  })

  it('il totale del mese non cambia: si sposta, non si crea né si perde', async () => {
    // L'invariante che conta davvero. Se questa somma cambiasse, la
    // suddivisione starebbe inventando o bruciando denaro.
    const venue = await venueDiTest()
    const alimentari = await conto('Alimentari')
    const pulizie = await conto('Pulizie')
    const entry = await movimento(venue.id, { giorno: `${ANNO}-03-10`, uscita: 1000 })
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { accountId: alimentari.id },
    })
    await prisma.journalEntryAllocation.createMany({
      data: [
        { journalEntryId: entry.id, accountId: alimentari.id, importo: 700, origine: 'manuale' },
        { journalEntryId: entry.id, accountId: pulizie.id, importo: 300, origine: 'manuale' },
      ],
    })

    const righe = await movimentiPerContoEMese(venue.id, ANNO)
    const totale = righe.reduce((s, r) => s + r.avere.toNumber(), 0)

    expect(totale).toBe(1000)
  })

  it('una suddivisione parziale lascia il resto sul conto principale', async () => {
    // 1.000 € con una sola fetta da 300: 700 restano dove sono, non spariscono.
    const venue = await venueDiTest()
    const alimentari = await conto('Alimentari')
    const pulizie = await conto('Pulizie')
    const entry = await movimento(venue.id, { giorno: `${ANNO}-03-10`, uscita: 1000 })
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { accountId: alimentari.id },
    })
    await prisma.journalEntryAllocation.create({
      data: { journalEntryId: entry.id, accountId: pulizie.id, importo: 300, origine: 'manuale' },
    })

    const righe = await movimentiPerContoEMese(venue.id, ANNO)

    expect(
      righe.find((r) => r.accountId === alimentari.id && r.mese === 3)?.avere.toNumber()
    ).toBe(700)
    expect(
      righe.find((r) => r.accountId === pulizie.id && r.mese === 3)?.avere.toNumber()
    ).toBe(300)
    expect(righe.reduce((s, r) => s + r.avere.toNumber(), 0)).toBe(1000)
  })

  it('le fette di un movimento nascosto restano fuori, come il movimento', async () => {
    const venue = await venueDiTest()
    const alimentari = await conto('Alimentari')
    const pulizie = await conto('Pulizie')
    const entry = await movimento(venue.id, {
      giorno: `${ANNO}-03-10`,
      uscita: 1000,
      nascosto: true,
    })
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { accountId: alimentari.id },
    })
    await prisma.journalEntryAllocation.create({
      data: { journalEntryId: entry.id, accountId: pulizie.id, importo: 300, origine: 'manuale' },
    })

    const righe = await movimentiPerContoEMese(venue.id, ANNO)

    expect(righe.reduce((s, r) => s + r.avere.toNumber(), 0)).toBe(0)
  })
})
