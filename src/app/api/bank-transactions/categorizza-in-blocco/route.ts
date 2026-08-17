import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { categorizzaInBloccoSchema } from '@/lib/validations/reconciliation'
import { filtriDaSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { costruisciWhere } from '@/lib/banca/query-estratto-conto'
import { promuoviRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'
import { rispostaPerEsito } from '@/lib/banca/esiti-promozione'

/**
 * Categorizza N righe con la stessa imputazione (le 62 commissioni in un
 * colpo), per elenco di id o per filtro — lo stesso della lista, così «tutte
 * le N del filtro» sono esattamente quelle che si vedono.
 *
 * Una promozione per riga, ciascuna nella propria transazione: qui non c'è
 * una `updateMany` possibile, perché ogni riga crea la propria scrittura. Le
 * righe che non si possono promuovere (nel Cestino, scrittura ripartita…) si
 * saltano e si contano, coi primi motivi nella risposta.
 */
export const POST = withAuth(
  async (request, { venueId, user }) => {
    const parsed = categorizzaInBloccoSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Richiesta non valida', details: parsed.error.issues }, { status: 400 })
    }
    const { ids, filtro, imputazione } = parsed.data

    const where = ids
      ? { id: { in: ids }, venueId, deletedAt: null }
      : costruisciWhere(filtriDaSearchParams(new URLSearchParams(filtro)), venueId)
    const righe = await prisma.bankTransaction.findMany({
      where,
      select: { id: true },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    })
    // Gli id chiesti ma non trovati (Cestino, altra sede) contano fra le saltate.
    const trovate = new Set(righe.map((r) => r.id))
    const dettagli: Array<{ id: string; motivo: string }> = (ids ?? [])
      .filter((id) => !trovate.has(id))
      .map((id) => ({ id, motivo: 'Movimento non trovato o nel Cestino' }))

    let toccate = 0
    for (const r of righe) {
      const esito = await promuoviRigaBancaria({
        bankTransactionId: r.id,
        venueId,
        userId: user.id ?? null,
        origine: 'categorizza',
        imputazione,
      })
      if (esito.outcome === 'ok') toccate++
      else dettagli.push({ id: r.id, motivo: String(rispostaPerEsito(esito).corpo.error ?? esito.outcome) })
    }

    await createAuditLog({
      userId: user.id ?? null,
      action: 'UPDATE',
      entityType: 'BankTransaction',
      venueId,
      newValues: { categorizzaInBlocco: true, toccate, saltate: dettagli.length, ...imputazione },
    })

    return NextResponse.json({ toccate, saltate: dettagli.length, dettagli: dettagli.slice(0, 20) })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
