import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { creaChiusura, venueDiTest } from '@/test/integration/fixtures/closures'

/**
 * Il contratto della cancellazione logica, provato sul database vero.
 *
 * L'estensione di `@/lib/prisma` è l'unico punto in cui il progetto decide che
 * cosa significhi "cancellato": se copre solo una parte dei metodi, il record
 * cancellato continua a camminare dalla porta di servizio — recuperato per id,
 * aggiornato, validato. Questi test descrivono il contratto per intero, metodo
 * per metodo, invece di rincorrere i singoli punti di chiamata.
 *
 * Le asserzioni sullo stato finale passano da `$queryRaw`, non dal client
 * esteso: quello è il codice sotto esame, e usarlo per giudicare sé stesso
 * nasconderebbe proprio l'errore che si cerca.
 */
setupIntegrationDb()

const GIORNO = new Date('2026-06-10')

/** Cancella logicamente una chiusura e ne restituisce l'id. */
async function chiusuraCancellata(date: Date = GIORNO): Promise<string> {
  const chiusura = await creaChiusura({ date, postazioni: [{ cashAmount: 100 }] })
  await prisma.dailyClosure.updateMany({
    where: { id: chiusura.id },
    data: { deletedAt: new Date() },
  })
  return chiusura.id
}

/** Legge una riga scavalcando il client esteso. */
async function rigaGrezza(id: string) {
  const righe = await prisma.$queryRaw<
    { id: string; notes: string | null; deleted_at: Date | null }[]
  >`SELECT id, notes, deleted_at FROM daily_closures WHERE id = ${id}`
  return righe[0] ?? null
}

describe('cancellazione logica: letture per chiave unica', () => {
  it('findUnique non restituisce un record cancellato', async () => {
    const id = await chiusuraCancellata()

    const trovata = await prisma.dailyClosure.findUnique({ where: { id } })

    expect(trovata).toBeNull()
  })

  it('findUnique non lo restituisce nemmeno quando la select esclude deletedAt', async () => {
    // Caso insidioso: chiedendo solo due colonne, il record che torna non porta
    // con sé l'informazione che servirebbe a scartarlo. Chi filtra il risultato
    // invece della query qui non ha di che decidere.
    const id = await chiusuraCancellata()

    const trovata = await prisma.dailyClosure.findUnique({
      where: { id },
      select: { id: true, status: true },
    })

    expect(trovata).toBeNull()
  })

  it('findUnique non lo restituisce per chiave composta', async () => {
    const venue = await venueDiTest()
    await chiusuraCancellata()

    const trovata = await prisma.dailyClosure.findUnique({
      where: { venueId_date: { venueId: venue.id, date: GIORNO } },
    })

    expect(trovata).toBeNull()
  })

  it('findUniqueOrThrow solleva l’errore di record assente', async () => {
    const id = await chiusuraCancellata()

    await expect(
      prisma.dailyClosure.findUniqueOrThrow({ where: { id } })
    ).rejects.toMatchObject({ code: 'P2025' })
  })

  it('continua a restituire i record vivi', async () => {
    const viva = await creaChiusura({ date: GIORNO })

    const trovata = await prisma.dailyClosure.findUnique({ where: { id: viva.id } })

    expect(trovata?.id).toBe(viva.id)
  })
})

describe('cancellazione logica: scritture per chiave unica', () => {
  it('update non ha effetto su un record cancellato', async () => {
    const id = await chiusuraCancellata()

    await expect(
      prisma.dailyClosure.update({ where: { id }, data: { notes: 'toccata' } })
    ).rejects.toMatchObject({ code: 'P2025' })

    expect((await rigaGrezza(id))?.notes).toBeNull()
  })

  it('delete non rimuove un record cancellato', async () => {
    const id = await chiusuraCancellata()

    await expect(prisma.dailyClosure.delete({ where: { id } })).rejects.toMatchObject({
      code: 'P2025',
    })

    // La riga deve restare al suo posto: la cancellazione logica esiste proprio
    // perché il dato contabile non sparisca.
    expect(await rigaGrezza(id)).not.toBeNull()
  })

  it('update e delete continuano a funzionare sui record vivi', async () => {
    const viva = await creaChiusura({ date: GIORNO })

    await prisma.dailyClosure.update({ where: { id: viva.id }, data: { notes: 'ok' } })
    expect((await rigaGrezza(viva.id))?.notes).toBe('ok')

    await prisma.dailyClosure.delete({ where: { id: viva.id } })
    expect(await rigaGrezza(viva.id)).toBeNull()
  })
})

describe('cancellazione logica: le vie di fuga restano aperte', () => {
  it('un deletedAt esplicito nella where raggiunge i cancellati', async () => {
    // Ripristini, rapporti storici e censimenti hanno bisogno di vederli: chi
    // nomina `deletedAt` sa quello che sta facendo e l'estensione si tira da
    // parte.
    const id = await chiusuraCancellata()

    const trovata = await prisma.dailyClosure.findUnique({
      where: { id, deletedAt: { not: null } },
    })

    expect(trovata?.id).toBe(id)
  })

  it('permette di ripristinare un record cancellato', async () => {
    const id = await chiusuraCancellata()

    await prisma.dailyClosure.update({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })

    expect(await prisma.dailyClosure.findUnique({ where: { id } })).not.toBeNull()
  })

  it('non tocca i modelli senza cancellazione logica', async () => {
    const venue = await prisma.venue.create({
      data: { name: 'Sede di prova', code: 'PROVA' },
    })

    const trovata = await prisma.venue.findUnique({ where: { id: venue.id } })
    expect(trovata?.id).toBe(venue.id)

    await prisma.venue.update({ where: { id: venue.id }, data: { name: 'Rinominata' } })
    const dopo = await prisma.venue.findUniqueOrThrow({ where: { id: venue.id } })
    expect(dopo.name).toBe('Rinominata')
  })
})
