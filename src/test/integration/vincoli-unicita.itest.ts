import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
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
