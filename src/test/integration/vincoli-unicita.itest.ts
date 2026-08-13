import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { setupIntegrationDb } from './db'
import { creaChiusura, venueDiTest } from './fixtures/closures'

/**
 * Prova che i vincoli di unicità siano attivi nel database dei test.
 *
 * Non verifica il comportamento dell'applicazione: verifica l'ambiente su cui
 * gli altri test poggiano. Serve perché quei vincoli sono indici parziali
 * (`CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`), che Prisma non sa
 * dichiarare e che quindi `prisma db push` non crea: vivono in un file SQL
 * applicato a parte dal global setup. Se quel passo saltasse, i test sui
 * duplicati contabili fallirebbero — o peggio, passerebbero — per un difetto
 * d'ambiente invece che per il comportamento del codice, e qualcuno finirebbe
 * per "aggiustare" codice sano.
 *
 * La chiusura di cassa è il caso più parlante: dimostra in un colpo solo che il
 * vincolo esiste e che è parziale.
 */
setupIntegrationDb()

const GIORNO = new Date('2026-05-20')

describe('vincoli di unicità nel database di test', () => {
  it('rifiuta due chiusure per la stessa sede e lo stesso giorno', async () => {
    await creaChiusura({ date: GIORNO })

    await expect(creaChiusura({ date: GIORNO })).rejects.toMatchObject({
      code: 'P2002',
    })
  })

  it('dopo la cancellazione logica quel giorno torna libero', async () => {
    const prima = await creaChiusura({ date: GIORNO })

    // Con un unique "pieno" il giorno resterebbe occupato per sempre: è
    // esattamente il difetto che l'indice parziale corregge.
    await prisma.dailyClosure.update({
      where: { id: prima.id },
      data: { deletedAt: new Date() },
    })

    const seconda = await creaChiusura({ date: GIORNO })

    expect(seconda.id).not.toBe(prima.id)
  })

  it('sedi diverse possono chiudere lo stesso giorno', async () => {
    const weiss = await venueDiTest()
    const altra = await prisma.venue.create({
      data: { name: 'Sede di prova', code: 'PROVA' },
    })

    await creaChiusura({ date: GIORNO, venueId: weiss.id })
    const seconda = await creaChiusura({ date: GIORNO, venueId: altra.id })

    expect(seconda.venueId).toBe(altra.id)
  })
})

/**
 * `InvoiceLineAccount`: il vincolo di unicità che il Task 5 sposta.
 *
 * Prima era `unique(invoiceId, numeroLinea)`, che vietava per costruzione due
 * imputazioni sulla stessa riga — cioè vietava il fornitore che accorpa voci
 * diverse in una riga sola (100 € di "detersivi" che sono 60 di detersivi e
 * 40 di tovaglioli). Il vincolo nuovo, `unique(invoiceId, numeroLinea,
 * progressivo)`, apre quel caso senza aprire i duplicati: stesso numeroLinea
 * e progressivo diverso convivono, stesso numeroLinea e stesso progressivo no.
 */
describe('InvoiceLineAccount: la riga di fattura divisibile fra più conti', () => {
  async function fatturaDiTest() {
    const venueId = (await venueDiTest()).id
    return prisma.electronicInvoice.create({
      data: {
        venueId,
        invoiceNumber: `FT-${Math.random().toString(36).slice(2, 10)}`,
        invoiceDate: new Date('2026-08-01'),
        supplierVat: '01234567890',
        supplierName: 'Fornitore di prova',
        totalAmount: new Prisma.Decimal(100),
        netAmount: new Prisma.Decimal(100),
        vatAmount: new Prisma.Decimal(0),
        status: 'RECORDED',
      },
    })
  }

  async function contoDiTest() {
    const conto = await prisma.account.findFirst({ where: { isActive: true } })
    if (!conto) {
      throw new Error('Nessun conto attivo nel seed di test.')
    }
    return conto.id
  }

  it('due imputazioni sullo stesso numeroLinea con progressivo diverso: entrambe valide', async () => {
    const fattura = await fatturaDiTest()
    const accountId = await contoDiTest()

    await prisma.invoiceLineAccount.create({
      data: {
        invoiceId: fattura.id,
        numeroLinea: 1,
        progressivo: 0,
        descrizione: 'Detersivi',
        importo: new Prisma.Decimal(60),
        accountId,
        fonte: 'manuale',
      },
    })
    const seconda = await prisma.invoiceLineAccount.create({
      data: {
        invoiceId: fattura.id,
        numeroLinea: 1,
        progressivo: 1,
        descrizione: 'Tovaglioli',
        importo: new Prisma.Decimal(40),
        accountId,
        fonte: 'manuale',
      },
    })

    expect(seconda.progressivo).toBe(1)
  })

  it('due imputazioni sullo stesso numeroLinea e stesso progressivo: violazione di unicità', async () => {
    const fattura = await fatturaDiTest()
    const accountId = await contoDiTest()

    await prisma.invoiceLineAccount.create({
      data: {
        invoiceId: fattura.id,
        numeroLinea: 1,
        progressivo: 0,
        descrizione: 'Detersivi',
        importo: new Prisma.Decimal(60),
        accountId,
        fonte: 'manuale',
      },
    })

    await expect(
      prisma.invoiceLineAccount.create({
        data: {
          invoiceId: fattura.id,
          numeroLinea: 1,
          progressivo: 0,
          descrizione: 'Tovaglioli',
          importo: new Prisma.Decimal(40),
          accountId,
          fonte: 'manuale',
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})
