import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { azioniInBloccoSchema } from '@/lib/validations/reconciliation'
import { filtriDaSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { costruisciWhere } from '@/lib/banca/query-estratto-conto'

/**
 * Sposta in / Cestino / Ripristina su più righe, per elenco di id o per filtro.
 * Il filtro è lo stesso della lista: chi sceglie «tutte le 231 del filtro»
 * ottiene esattamente le 231 che vede, calcolate dal server.
 *
 * Le scritture sono **insiemistiche**: una `updateMany` per l'azione e una sola
 * `createMany` per la cronologia. Un ciclo riga per riga dentro la transazione
 * costava due andate e ritorni per movimento — 462 su 231 righe — e la
 * transazione interattiva di Prisma si chiude da sé dopo 5 secondi: proprio
 * «tutte le 231 del filtro», il caso per cui l'azione in blocco esiste, era
 * quello che rischiava il P2028 in produzione.
 */
export const POST = withAuth(
  async (request, { venueId, user }) => {
    const parsed = azioniInBloccoSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Richiesta non valida', details: parsed.error.issues }, { status: 400 })
    const { azione, sezione, ids, filtro } = parsed.data

    const where = ids
      ? { id: { in: ids }, venueId, ...(azione === 'ripristina' ? { deletedAt: { not: null } } : { deletedAt: null }) }
      : costruisciWhere(filtriDaSearchParams(new URLSearchParams(filtro)), venueId)

    const righe = await prisma.bankTransaction.findMany({ where, select: { id: true, sezione: true, matchedEntryId: true, deletedAt: true } })

    const esito = await prisma.$transaction(
      async (tx) => {
        if (azione === 'sposta') {
          // Chi è già nella scheda di destinazione non si tocca e non si conta.
          // Fuori anche i cestinati: per `ids` e per il filtro normale non ce ne
          // sono, ma `filtro: { cestino: '1' }` (via API, la UI non lo compone)
          // li porterebbe dentro, e la `updateMany` qui sotto — che scrive solo
          // sulle righe vive — li lascerebbe fermi mentre la cronologia
          // racconterebbe uno spostamento mai avvenuto.
          const daSpostare = righe.filter((r) => r.sezione !== sezione && r.deletedAt === null)
          if (daSpostare.length === 0) return { toccate: 0, saltate: 0 }
          const idsDaSpostare = daSpostare.map((r) => r.id)
          const risultato = await tx.bankTransaction.updateMany({
            where: { id: { in: idsDaSpostare }, venueId, deletedAt: null },
            data: { sezione },
          })
          await tx.bankTransactionEdit.createMany({
            data: daSpostare.map((r) => ({
              bankTransactionId: r.id,
              campo: 'sezione',
              prima: r.sezione,
              dopo: sezione!,
              userId: user.id ?? null,
            })),
          })
          return { toccate: risultato.count, saltate: 0 }
        }

        if (azione === 'cestino') {
          // Una riga con una scrittura collegata non si cestina: si salta e si
          // conta a parte, così il messaggio dice quante e perché.
          const cestinabili = righe.filter((r) => !r.matchedEntryId)
          const saltate = righe.length - cestinabili.length
          if (cestinabili.length === 0) return { toccate: 0, saltate }
          const risultato = await tx.bankTransaction.updateMany({
            where: { id: { in: cestinabili.map((r) => r.id) }, venueId, deletedAt: null },
            data: { deletedAt: new Date(), deletedById: user.id ?? null },
          })
          return { toccate: risultato.count, saltate }
        }

        if (righe.length === 0) return { toccate: 0, saltate: 0 }
        const risultato = await tx.bankTransaction.updateMany({
          where: { id: { in: righe.map((r) => r.id) }, venueId, deletedAt: { not: null } },
          data: { deletedAt: null, deletedById: null },
        })
        return { toccate: risultato.count, saltate: 0 }
      },
      { timeout: 30_000 }
    )

    return NextResponse.json(esito)
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
