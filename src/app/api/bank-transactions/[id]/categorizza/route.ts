import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { categorizzaSchema } from '@/lib/validations/reconciliation'
import { promuoviRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'
import { rispostaPerEsito } from '@/lib/banca/esiti-promozione'

/**
 * Categorizza: promuove la riga a scrittura di prima nota con conto e centro,
 * senza documenti; su una riga già promossa aggiorna l'imputazione (spec,
 * «Le azioni»).
 */
export const POST = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    const parsed = categorizzaSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Imputazione non valida', details: parsed.error.issues }, { status: 400 })
    }

    const esito = await promuoviRigaBancaria({
      bankTransactionId: params.id,
      venueId,
      userId: user.id ?? null,
      origine: 'categorizza',
      imputazione: parsed.data,
    })

    if (esito.outcome === 'ok') {
      await createAuditLog({
        userId: user.id ?? null,
        action: esito.creata ? 'CREATE' : 'UPDATE',
        entityType: 'JournalEntry',
        entityId: esito.journalEntryId,
        venueId,
        newValues: { daRigaBancaria: params.id, ...parsed.data },
      })
    }
    const { status, corpo } = rispostaPerEsito(esito)
    return NextResponse.json(corpo, { status })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
