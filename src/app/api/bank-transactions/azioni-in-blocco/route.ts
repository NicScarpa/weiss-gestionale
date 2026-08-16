import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { azioniInBloccoSchema } from '@/lib/validations/reconciliation'
import { filtriDaSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { costruisciWhere } from '@/lib/banca/query-estratto-conto'
import { registraModifiche } from '@/lib/banca/cronologia'

/**
 * Sposta in / Cestino / Ripristina su più righe, per elenco di id o per filtro.
 * Il filtro è lo stesso della lista: chi sceglie «tutte le 231 del filtro»
 * ottiene esattamente le 231 che vede, calcolate dal server.
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

    const esito = await prisma.$transaction(async (tx) => {
      let toccate = 0
      let saltate = 0
      for (const riga of righe) {
        if (azione === 'sposta') {
          if (riga.sezione === sezione) continue
          await tx.bankTransaction.update({ where: { id: riga.id }, data: { sezione } })
          await registraModifiche(tx, { bankTransactionId: riga.id, userId: user.id ?? null, modifiche: [{ campo: 'sezione', prima: riga.sezione, dopo: sezione! }] })
          toccate++
        } else if (azione === 'cestino') {
          if (riga.matchedEntryId) { saltate++; continue }
          await tx.bankTransaction.updateMany({ where: { id: riga.id, deletedAt: null }, data: { deletedAt: new Date(), deletedById: user.id ?? null } })
          toccate++
        } else {
          const r = await tx.bankTransaction.updateMany({ where: { id: riga.id, deletedAt: { not: null } }, data: { deletedAt: null, deletedById: null } })
          toccate += r.count
        }
      }
      return { toccate, saltate }
    })

    return NextResponse.json(esito)
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
