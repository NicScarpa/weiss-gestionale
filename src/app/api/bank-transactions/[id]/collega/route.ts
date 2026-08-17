import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { collegaSchema } from '@/lib/validations/reconciliation'
import { promuoviRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'
import { rispostaPerEsito } from '@/lib/banca/esiti-promozione'

/**
 * Collega fattura: le scadenze con la quota di ciascuna (residuo sulla riga
 * se non coprono tutto), oppure una scrittura esistente — la R4, che si lega
 * senza creare nulla (spec, «Le azioni»).
 */
export const POST = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    const parsed = collegaSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Richiesta non valida', details: parsed.error.issues }, { status: 400 })
    }

    const esito = await promuoviRigaBancaria({
      bankTransactionId: params.id,
      venueId,
      userId: user.id ?? null,
      origine: 'collega',
      scadenze: parsed.data.scadenze,
      scritturaEsistenteId: parsed.data.scritturaEsistenteId,
    })

    if (esito.outcome === 'ok') {
      await createAuditLog({
        userId: user.id ?? null,
        action: esito.creata ? 'CREATE' : 'UPDATE',
        entityType: 'JournalEntry',
        entityId: esito.journalEntryId,
        venueId,
        newValues: { daRigaBancaria: params.id, ...parsed.data, riconciliazioni: esito.reconciliationIds },
      })
    }
    const { status, corpo } = rispostaPerEsito(esito)
    return NextResponse.json(corpo, { status })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
